#define PY_SSIZE_T_CLEAN
#include <Python/Python.h>
#include "quickjs.h"
#include "RitvioResolverBridge.h"
#include <stdatomic.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define JS_MEMORY_LIMIT (128 * 1024 * 1024)
#define JS_INPUT_LIMIT (12 * 1024 * 1024)
#define JS_OUTPUT_LIMIT (4 * 1024 * 1024)
static atomic_llong activeGeneration = 0;
static atomic_llong cancelledGeneration = -1;
static atomic_ullong evaluationCount = 0;
static double operationDeadline = 0;
static bool initialized = false;
static bool initializationAttempted = false;

static double monotonic_time(void) {
    struct timespec value;
    clock_gettime(CLOCK_MONOTONIC, &value);
    return value.tv_sec + value.tv_nsec / 1000000000.0;
}
static const char *abort_reason(void) {
    long long active = atomic_load(&activeGeneration);
    if (active && atomic_load(&cancelledGeneration) == active) return "cancelled";
    if (active && monotonic_time() >= operationDeadline) return "timeout";
    return NULL;
}
static PyObject *python_abort_reason(PyObject *self, PyObject *args) {
    const char *reason = abort_reason();
    if (reason) return PyUnicode_FromString(reason);
    Py_RETURN_NONE;
}
typedef struct { double deadline; char *output; } Challenge;
static int interrupt_js(JSRuntime *runtime, void *opaque) {
    Challenge *challenge = opaque;
    return abort_reason() != NULL || monotonic_time() >= challenge->deadline;
}
static JSValue log_js(JSContext *context, JSValueConst thisValue, int argc, JSValueConst *argv) {
    Challenge *challenge = JS_GetContextOpaque(context);
    if (!argc) return JS_UNDEFINED;
    size_t length = 0;
    const char *text = JS_ToCStringLen(context, &length, argv[0]);
    if (!text) return JS_EXCEPTION;
    if (length > JS_OUTPUT_LIMIT) {
        JS_FreeCString(context, text);
        return JS_ThrowRangeError(context, "Challenge output exceeded its limit");
    }
    char *copy = malloc(length + 1);
    if (!copy) { JS_FreeCString(context, text); return JS_ThrowOutOfMemory(context); }
    memcpy(copy, text, length); copy[length] = 0;
    free(challenge->output); challenge->output = copy;
    JS_FreeCString(context, text);
    return JS_UNDEFINED;
}
static JSValue ignore_js(JSContext *context, JSValueConst thisValue, int argc, JSValueConst *argv) { return JS_UNDEFINED; }
static PyObject *python_evaluate(PyObject *self, PyObject *args) {
    const char *script; Py_ssize_t length; int milliseconds = 12000;
    if (!PyArg_ParseTuple(args, "s#|i", &script, &length, &milliseconds)) return NULL;
    if (length > JS_INPUT_LIMIT || milliseconds < 1 || milliseconds > 12000) {
        PyErr_SetString(PyExc_ValueError, "Invalid challenge budget"); return NULL;
    }
    JSRuntime *runtime = JS_NewRuntime();
    if (!runtime) return PyErr_NoMemory();
    JS_SetMemoryLimit(runtime, JS_MEMORY_LIMIT);
    JS_SetMaxStackSize(runtime, 256 * 1024);
    Challenge challenge = {.deadline = monotonic_time() + milliseconds / 1000.0, .output = NULL};
    JS_SetInterruptHandler(runtime, interrupt_js, &challenge);
    JSContext *context = JS_NewContext(runtime);
    if (!context) { JS_FreeRuntime(runtime); return PyErr_NoMemory(); }
    JS_SetContextOpaque(context, &challenge);
    JSValue global = JS_GetGlobalObject(context), console = JS_NewObject(context);
    JS_SetPropertyStr(context, console, "log", JS_NewCFunction(context, log_js, "log", 1));
    JS_SetPropertyStr(context, console, "warn", JS_NewCFunction(context, ignore_js, "warn", 1));
    JS_SetPropertyStr(context, console, "error", JS_NewCFunction(context, ignore_js, "error", 1));
    JS_SetPropertyStr(context, global, "console", console);
    JS_FreeValue(context, global);
    atomic_fetch_add(&evaluationCount, 1);
    JSValue result = JS_Eval(context, script, (size_t)length, "provider-challenge.js", JS_EVAL_TYPE_GLOBAL);
    bool failed = JS_IsException(result);
    JS_FreeValue(context, result);
    if (!failed) {
        JSContext *jobContext;
        int jobs = 0;
        while (JS_IsJobPending(runtime) && !interrupt_js(runtime, &challenge)) {
            if (++jobs > 1024 || JS_ExecutePendingJob(runtime, &jobContext) < 0) { failed = true; break; }
        }
        if (interrupt_js(runtime, &challenge) || JS_IsJobPending(runtime)) failed = true;
    }
    if (failed) { JSValue exception = JS_GetException(context); JS_FreeValue(context, exception); }
    PyObject *output = NULL;
    if (failed || !challenge.output) PyErr_SetString(PyExc_RuntimeError, "Challenge failed or exceeded its execution/memory limit");
    else output = PyUnicode_FromString(challenge.output);
    free(challenge.output); JS_FreeContext(context); JS_FreeRuntime(runtime);
    return output;
}
static PyObject *python_stats(PyObject *self, PyObject *args) {
    return Py_BuildValue("{s:s,s:K,s:i,s:i,s:O}", "name", "QuickJS 2026-06-04", "evaluations", atomic_load(&evaluationCount), "memoryLimitBytes", JS_MEMORY_LIMIT, "maxExecutionMilliseconds", 12000, "jit", Py_False);
}
static PyMethodDef methods[] = {
    {"evaluate", python_evaluate, METH_VARARGS, "Evaluate a challenge in a bounded interpreter with no host IO."},
    {"abort_reason", python_abort_reason, METH_NOARGS, "Check native cancellation/deadline."},
    {"stats", python_stats, METH_NOARGS, "Return interpreter limits and counter."},
    {NULL, NULL, 0, NULL}
};
static struct PyModuleDef nativeModule = {PyModuleDef_HEAD_INIT, "_ritvio_native", NULL, -1, methods};
static PyObject *PyInit_ritvio_native(void) { return PyModule_Create(&nativeModule); }
static int trace_python(PyObject *object, PyFrameObject *frame, int event, PyObject *argument) {
    const char *reason = abort_reason();
    if (reason) { PyErr_SetString(PyExc_TimeoutError, reason); return -1; }
    return 0;
}
static bool configure_python(const char *bundlePath) {
    PyConfig config; PyConfig_InitIsolatedConfig(&config);
    config.install_signal_handlers = 0; config.write_bytecode = 0; config.parse_argv = 0;
    char home[4096], program[4096];
    if (snprintf(home, sizeof(home), "%s/python", bundlePath) >= sizeof(home) || snprintf(program, sizeof(program), "%s/App", bundlePath) >= sizeof(program)) return false;
    PyStatus status = PyConfig_SetBytesString(&config, &config.home, home);
    if (!PyStatus_Exception(status)) status = PyConfig_SetBytesString(&config, &config.program_name, program);
    const char *paths[] = {"python/lib/python3.13", "python/lib/python3.13/lib-dynload", "Resolver/app", "Resolver/site-packages"};
    config.module_search_paths_set = 1;
    for (int i = 0; !PyStatus_Exception(status) && i < 4; i++) {
        char value[4096];
        if (snprintf(value, sizeof(value), "%s/%s", bundlePath, paths[i]) >= sizeof(value)) { PyConfig_Clear(&config); return false; }
        wchar_t *wide = Py_DecodeLocale(value, NULL);
        if (!wide) { PyConfig_Clear(&config); return false; }
        status = PyWideStringList_Append(&config.module_search_paths, wide);
        PyMem_RawFree(wide);
    }
    if (!PyStatus_Exception(status) && PyImport_AppendInittab("_ritvio_native", PyInit_ritvio_native) == 0) status = Py_InitializeFromConfig(&config);
    else { PyConfig_Clear(&config); return false; }
    bool success = !PyStatus_Exception(status);
    if (!success) fprintf(stderr, "RITVIO Python initialization failed: %s\n", status.err_msg ? status.err_msg : "unknown");
    PyConfig_Clear(&config);
    if (success) PyEval_SaveThread();
    return success;
}
char *RitvioResolverInvoke(const char *bundlePath, const char *payload, int64_t generation, int budgetMilliseconds) {
    if (!bundlePath || !payload || strlen(payload) > 16384 || generation <= 0 || budgetMilliseconds < 100 || budgetMilliseconds > 60000) return strdup("{\"ok\":false,\"error\":\"INVALID_ARGUMENT\"}");
    operationDeadline = monotonic_time() + budgetMilliseconds / 1000.0;
    atomic_store(&activeGeneration, generation);
    if (!initialized) {
        if (!initializationAttempted) { initializationAttempted = true; initialized = configure_python(bundlePath); }
        if (!initialized) { atomic_store(&activeGeneration, 0); return strdup("{\"ok\":false,\"error\":\"PYTHON_INITIALIZATION_FAILED\"}"); }
    }
    PyGILState_STATE gil = PyGILState_Ensure();
    PyObject *module = PyImport_ImportModule("ios_resolver");
    if (!module) {
        PyErr_Print(); PyGILState_Release(gil); atomic_store(&activeGeneration, 0);
        return strdup("{\"ok\":false,\"error\":\"PYTHON_IMPORT_FAILED\"}");
    }
    PyEval_SetTrace(trace_python, NULL);
    PyObject *result = PyObject_CallMethod(module, "invoke", "s", payload);
    PyEval_SetTrace(NULL, NULL);
    char *copy = NULL;
    if (result && PyUnicode_Check(result)) {
        Py_ssize_t length; const char *text = PyUnicode_AsUTF8AndSize(result, &length);
        if (text && length <= 2 * 1024 * 1024) copy = strdup(text);
    }
    if (!copy) {
        const char *reason = abort_reason();
        copy = strdup(reason && !strcmp(reason, "cancelled") ? "{\"ok\":false,\"error\":\"CANCELLED\"}" : reason ? "{\"ok\":false,\"error\":\"TIMEOUT\"}" : "{\"ok\":false,\"error\":\"PYTHON_EXECUTION_FAILED\"}");
        PyErr_Clear();
    }
    Py_XDECREF(result); Py_DECREF(module); PyGILState_Release(gil);
    atomic_store(&activeGeneration, 0);
    return copy;
}
void RitvioResolverCancel(int64_t generation) { atomic_store(&cancelledGeneration, generation); }
void RitvioResolverFree(char *value) { free(value); }
