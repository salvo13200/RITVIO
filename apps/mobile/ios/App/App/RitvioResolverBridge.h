#ifndef RITVIO_RESOLVER_BRIDGE_H
#define RITVIO_RESOLVER_BRIDGE_H
#include <stdint.h>
char *RitvioResolverInvoke(const char *bundlePath, const char *payload, int64_t generation, int budgetMilliseconds);
void RitvioResolverCancel(int64_t generation);
void RitvioResolverFree(char *value);
#endif
