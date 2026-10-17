import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {loadConfig} from '../apps/api/config';
test('packaged paths locate bundled resolvers and write the cache outside the application archive',()=>{
  const root=path.resolve('release/win-unpacked/resources/app.asar');
  const runtime={dataDirectory:path.resolve('.packaging/test-user/cache'),python:path.resolve('release/win-unpacked/resources/runtime/python/python.exe'),node:path.resolve('release/win-unpacked/RITVIO.exe'),catalogScript:path.resolve('release/win-unpacked/resources/scripts/music-catalog.py'),electronNode:true};
  const config=loadConfig(root,runtime);
  assert.equal(config.root,root);assert.equal(config.python,runtime.python);assert.equal(config.node,runtime.node);
  assert.equal(config.catalogScript,runtime.catalogScript);assert.equal(config.electronNode,true);
  assert.equal(config.database,path.join(runtime.dataDirectory,'mvp.sqlite'));
  assert.notEqual(loadConfig(root,runtime).token,config.token);
});
