import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanUILayout,defaultUILayout} from '../packages/domain/ui-layout';
test('older player profiles load the default layout without a migration',()=>{
  for(const value of [undefined,null,false,42,'old-profile'])assert.deepEqual(cleanUILayout(value),defaultUILayout());
});
test('corrupt layout data cannot create unbounded panels or enable an unknown motion mode',()=>{
  assert.deepEqual(cleanUILayout({sidebarWidth:NaN,panelWidth:Infinity,sidebarCollapsed:'true',motion:'unknown'}),defaultUILayout());
  assert.deepEqual(cleanUILayout({sidebarWidth:-1000,panelWidth:999999,sidebarCollapsed:true,motion:'essential'}),{sidebarWidth:216,panelWidth:420,sidebarCollapsed:true,motion:'essential'});
});
test('persisted preferences survive normalization independently of unrelated player data',()=>{
  const saved={sidebarWidth:278.4,panelWidth:354.8,sidebarCollapsed:true,motion:'essential',queue:['unrelated']};
  assert.deepEqual(cleanUILayout(JSON.parse(JSON.stringify(saved))),{sidebarWidth:278,panelWidth:355,sidebarCollapsed:true,motion:'essential'});
});
