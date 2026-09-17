import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IllustratorReadBridge, IllustratorStatus, ScriptResult } from "../src/executor/bridge.js";
import type { DocumentInfo, FindObjectsCriteria, FindObjectsOptions, FindObjectsResult } from "../src/executor/read-schema.js";
import { createWorkCopyIdentity, SafeMutationContext } from "../src/production/mutation/context.js";
import { alignObjects, clearSelection, createLine, createRectangle, distributeObjects, duplicateObjects, groupObjects, selectObjects, ungroupObject, updateObject } from "../src/production/mutation/editing.js";
import { IllustratorProductionSession } from "../src/production/session/illustrator-session.js";
import { ManagedSessionRegistry } from "../src/production/session/managed-sessions.js";
import { createDesignProductionMcpServer } from "../src/mcp/server.js";

class B1Bridge implements IllustratorReadBridge {
  readonly id = "b1-test";
  scripts: string[] = [];
  timeouts: Array<number | undefined> = [];
  openedPathOverride: string | null = null;
  async detect(): Promise<IllustratorStatus> { return { installed:true, running:true, version:"test", capabilities:{} }; }
  async execute<T>(script: string, timeoutMs?: number): Promise<ScriptResult<T>> {
    this.scripts.push(script); this.timeouts.push(timeoutMs);
    if (script.includes("source.saveAs")) return { ok:true, value:{path:"/tmp/work.ai"} as T };
    if (script.includes("app.open")) {
      const expected = /var expected = ("(?:[^"\\\\]|\\\\.)*")/.exec(script)?.[1];
      const openedPath = this.openedPathOverride ?? (expected ? JSON.parse(expected) : "/tmp/master.ai");
      return { ok:true, value:{name:path.basename(openedPath),path:openedPath,saved:true,version:"test"} as T };
    }
    if (script.includes("verified-read-refresh")) return { ok:true, value:{path:"/tmp/work.ai"} as T };
    if (script.includes("d.save();")) return { ok:true, value:{path:"/tmp/work.ai",saved:true} as T };
    if (script.includes("return {ok:true,value:summary") || script.includes("return {ok:true,value:after}") || script.includes("return {ok:true,value:out}") || script.includes("return {ok:true,value:{selectionCount") || script.includes("return {ok:true,value:{childCount")) return { ok:true, value:{ok:true,value:{typename:"PathItem",name:"",layerPath:"0",ancestry:["layer:0"],collectionPath:"layers/0/pageItems/0",locator:{kind:"document-session-structural",typename:"PathItem",name:"",layerPath:"0",ancestry:["layer:0"],collectionPath:"layers/0/pageItems/0"},locked:false,hidden:false,bounds:null,contentsPreview:null,contentsLength:null}} as T };
    return { ok:true, value:{} as T };
  }
  async getDocumentInfo(): Promise<ScriptResult<DocumentInfo>> { return {ok:true,value:{name:"work.ai",path:"/tmp/work.ai",saved:true,modified:null,modifiedSupported:false,colorSpace:"RGB",width:null,height:null,rulerUnits:null,artboardCount:1,layerCount:1,textFrameCount:0,placedImageCount:0,activeArtboardIndex:0}}; }
  async findObjects(_criteria: FindObjectsCriteria, _options?: FindObjectsOptions): Promise<ScriptResult<FindObjectsResult>> { return {ok:true,value:{matchedCount:0,results:[],truncated:false,truncationReason:null,criteriaApplied:_criteria}}; }
  async getArtboards(): Promise<never> { throw new Error("not used"); } async getLayers(): Promise<never> { throw new Error("not used"); } async getSelection(): Promise<never> { throw new Error("not used"); } async listTextFrames(): Promise<never> { throw new Error("not used"); } async getTextFrameDetail(): Promise<never> { throw new Error("not used"); } async getGroups(): Promise<never> { throw new Error("not used"); } async getDocumentStructure(): Promise<never> { throw new Error("not used"); } async convertCoordinate(): Promise<never> { throw new Error("not used"); } async getColors(): Promise<never> { throw new Error("not used"); } async getImages(): Promise<never> { throw new Error("not used"); } async listFonts(): Promise<never> { throw new Error("not used"); }
}

function verifiedContext() { const identity=createWorkCopyIdentity("/tmp/master.ai","/tmp/work.ai"); assert.equal(identity.ok,true); if(!identity.ok) throw new Error("setup"); return new SafeMutationContext(identity.value); }

test("B1 open_document does not authorize writes and save only accepts its verified work copy", async () => {
  const bridge=new B1Bridge(); const session=new IllustratorProductionSession(bridge);
  await session.openDocument("/tmp/master.ai");
  assert.equal(bridge.timeouts[0],120_000);
  const noGrant=await session.createRectangle("/tmp/work.ai",{x:1,y:1,width:2,height:2});
  assert.equal(noGrant.ok,false); assert.equal(noGrant.ok?undefined:noGrant.error.code,"WORK_COPY_REQUIRED");
  await session.saveWorkCopy({masterPath:"/tmp/master.ai",workPath:"/tmp/work.ai"});
  const rejected=await session.saveDocument("/tmp/master.ai"); assert.equal(rejected.ok,false);
  const saved=await session.saveDocument("/tmp/work.ai"); assert.equal(saved.ok,true);
  assert.equal(bridge.timeouts.at(-1),300_000);
});

test("B1 targetless creation remains allowed during refresh while target updates wait for a verified read", async () => {
  const bridge=new B1Bridge(); const context=verifiedContext();
  const created=await createRectangle(bridge,context,"/tmp/work.ai",{x:10,y:10,width:30,height:20,fill:{model:"RGB",red:1,green:2,blue:3}});
  assert.equal(created.ok,true); assert.equal(context.state,"REFRESH_REQUIRED");
  const again=await createRectangle(bridge,context,"/tmp/work.ai",{x:50,y:10,width:20,height:10}); assert.equal(again.ok,true);
  const blocked=await updateObject(bridge,context,"/tmp/work.ai",{locator:{kind:"document-session-structural",typename:"PathItem",name:"",layerPath:"0",ancestry:["layer:0"],collectionPath:"layers/0/pageItems/0"},expected:{typename:"PathItem"},x:5});
  assert.equal(blocked.ok,false); assert.equal(blocked.ok?undefined:blocked.error.code,"MUTATION_SCOPE_VIOLATION");
  assert.equal(context.refreshAfterVerifiedRead("/tmp/work.ai"),null); assert.equal(context.state,"READY");
});

test("B1 validates primitive input, refuses line fill, and keeps generated results DOM-free", async () => {
  const bridge=new B1Bridge(); const context=verifiedContext();
  const invalid=await createRectangle(bridge,context,"/tmp/work.ai",{x:0,y:0,width:0,height:1}); assert.equal(invalid.ok,false);
  const line=await createLine(bridge,context,"/tmp/work.ai",{x1:0,y1:0,x2:10,y2:10,fill:{model:"RGB",red:1,green:2,blue:3}} as never); assert.equal(line.ok,false);
  const unsupported=await createRectangle(bridge,context,"/tmp/work.ai",{x:0,y:0,width:1,height:1,fill:{model:"SPOT"} as never}); assert.equal(unsupported.ok,false);
  const valid=await createRectangle(bridge,context,"/tmp/work.ai",{x:0,y:0,width:1,height:1}); assert.equal(valid.ok,true);
  assert.match(bridge.scripts.at(-1) ?? "", /return \{ok:true,value:after\}/);
});

test("B1 compares refreshed geometric bounds with a narrow Illustrator-safe tolerance", async () => {
  const bridge = new B1Bridge(); const context = verifiedContext();
  const result = await updateObject(bridge, context, "/tmp/work.ai", {
    locator: { kind:"document-session-structural", typename:"PathItem", name:"rect", layerPath:"0", ancestry:["layer:0"], collectionPath:"layers/0/pageItems/0" },
    expected: { typename:"PathItem", name:"rect", bounds:{left:1.0001,top:4.0001,right:3.0001,bottom:2.0001,width:2,height:2} },
    x: 2,
  });
  assert.equal(result.ok, true);
  assert.match(bridge.scripts.at(-1) ?? "", /Math\.abs\(actual - wanted\) <= 0\.01/);
});

test("B1 quarantine cannot be refreshed", () => {
  const context=verifiedContext(); context.quarantine();
  const refreshed=context.refreshAfterVerifiedRead("/tmp/work.ai");
  assert.equal(refreshed?.code,"MUTATION_OUTCOME_UNKNOWN"); assert.equal(context.state,"QUARANTINED");
});

test("B1 filesystem create_work_copy issues no session until Illustrator opens the exact copied path", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dpm-b1-registry-"));
  const master = path.join(directory, "master.ai"); const work = path.join(directory, "work.ai");
  await writeFile(master, "persisted-master");
  try {
    const bridge = new B1Bridge(); bridge.openedPathOverride = master;
    const registry = new ManagedSessionRegistry(bridge);
    const result = await registry.createWorkCopy(master, work);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "WORK_COPY_IDENTITY_MISMATCH");
    const write = await registry.createRectangle("00000000-0000-4000-8000-000000000000", { x: 0, y: 0, width: 1, height: 1 });
    assert.equal(write.ok, false);
    if (!write.ok) assert.equal(write.error.code, "SESSION_NOT_FOUND");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("B1 filesystem copy failure issues no managed session", async () => {
  const bridge = new B1Bridge();
  const registry = new ManagedSessionRegistry(bridge, async () => ({ ok: false, error: { code: "WORK_COPY_COPY_VERIFICATION_FAILED", message: "hash mismatch" } }));
  const result = await registry.createWorkCopy("/tmp/master.ai", "/tmp/work.ai");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "WORK_COPY_COPY_VERIFICATION_FAILED");
});

test("B1 MCP server lists safe tools and rejects writes without a managed session", async () => {
  const registry=new ManagedSessionRegistry(new B1Bridge()); const server=createDesignProductionMcpServer(registry);
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  const client=new Client({name:"b1-test",version:"1"}); await server.connect(serverTransport); await client.connect(clientTransport);
  const tools=await client.listTools(); assert.ok(tools.tools.some((tool)=>tool.name==="create_rectangle")); assert.ok(!tools.tools.some((tool)=>tool.name.includes("script")));
  const read=await client.callTool({name:"get_document_info",arguments:{}}); assert.equal(read.isError,false);
  const write=await client.callTool({name:"create_rectangle",arguments:{sessionId:"00000000-0000-4000-8000-000000000000",x:0,y:0,width:1,height:1}}); assert.equal(write.isError,true);
  await client.close(); await server.close();
});

const target = { locator:{kind:"document-session-structural" as const,typename:"PathItem",name:"rect",layerPath:"0",ancestry:["layer:0"],collectionPath:"layers/0/pageItems/0"},expected:{typename:"PathItem",name:"rect"} };

test("B2 selection requires a managed session and preflights before changing selection", async () => {
  const bridge=new B1Bridge(); const registry=new ManagedSessionRegistry(bridge);
  const denied=await registry.selectObjects("00000000-0000-4000-8000-000000000000",{locators:[target.locator]}); assert.equal(denied.ok,false);
  const selected=await selectObjects(bridge,verifiedContext(),"/tmp/work.ai",{locators:[target.locator]}); assert.equal(selected.ok,true);
  const script=bridge.scripts.at(-1) ?? ""; assert.ok(script.indexOf("for(var i=0;i<locators.length;i++)") < script.indexOf("d.selection=null"));
});

test("B2 clear selection remains available while a refresh is required", async () => {
  const bridge=new B1Bridge(); const context=verifiedContext(); await createRectangle(bridge,context,"/tmp/work.ai",{x:0,y:0,width:1,height:1});
  assert.equal(context.state,"REFRESH_REQUIRED"); const cleared=await clearSelection(bridge,context,"/tmp/work.ai"); assert.equal(cleared.ok,true); assert.equal(context.state,"REFRESH_REQUIRED");
});

test("B2 structural operations validate inputs and require a fresh target state", async () => {
  const bridge=new B1Bridge(); const context=verifiedContext();
  assert.equal((await duplicateObjects(bridge,context,"/tmp/work.ai",{targets:[target],copies:101})).ok,false);
  assert.equal((await groupObjects(bridge,context,"/tmp/work.ai",{targets:[target]})).ok,false);
  const duplicate=await duplicateObjects(bridge,context,"/tmp/work.ai",{targets:[target],offsetX:10,offsetY:0}); assert.equal(duplicate.ok,true); assert.equal(context.state,"REFRESH_REQUIRED");
  const blocked=await groupObjects(bridge,context,"/tmp/work.ai",{targets:[target,{...target,locator:{...target.locator,collectionPath:"layers/0/pageItems/1"}}]}); assert.equal(blocked.ok,false);
});

test("B2 group, ungroup, align, and distribute expose deterministic guarded geometry", async () => {
  const bridge=new B1Bridge(); const context=verifiedContext(); const target2={...target,locator:{...target.locator,collectionPath:"layers/0/pageItems/1"}}; const target3={...target,locator:{...target.locator,collectionPath:"layers/0/pageItems/2"}};
  const grouped=await groupObjects(bridge,context,"/tmp/work.ai",{targets:[target,target2],name:"g"}); assert.equal(grouped.ok,true); assert.equal(context.state,"REFRESH_REQUIRED");
  context.refreshAfterVerifiedRead("/tmp/work.ai"); const ungrouped=await ungroupObject(bridge,context,"/tmp/work.ai",{target:{...target,locator:{...target.locator,typename:"GroupItem"},expected:{typename:"GroupItem"}}}); assert.equal(ungrouped.ok,true);
  context.refreshAfterVerifiedRead("/tmp/work.ai"); const aligned=await alignObjects(bridge,context,"/tmp/work.ai",{targets:[target,target2],mode:"LEFT",reference:"KEY_OBJECT",keyObject:target}); assert.equal(aligned.ok,true); assert.equal(context.state,"READY");
  const distributed=await distributeObjects(bridge,context,"/tmp/work.ai",{targets:[target,target2,target3],axis:"HORIZONTAL",mode:"GAPS"}); assert.equal(distributed.ok,true); assert.equal(context.state,"READY");
  assert.match(bridge.scripts.at(-1) ?? "", /step=\(span-used\)/);
});

test("B2/Phase2 MCP server exposes guarded editing and fused donor tools without an arbitrary script surface", async () => {
  const server=createDesignProductionMcpServer(new ManagedSessionRegistry(new B1Bridge())); const [ct,st]=InMemoryTransport.createLinkedPair(); const client=new Client({name:"b2-test",version:"1"}); await server.connect(st); await client.connect(ct);
  const names=(await client.listTools()).tools.map((tool)=>tool.name); for(const name of ["select_objects","clear_selection","duplicate_objects","group_objects","ungroup_object","align_objects","distribute_objects","pathfinder_objects","expand_objects","place_image","relink_image","rearrange_artboards","fit_artboard_to_objects"]) assert.ok(names.includes(name)); assert.ok(!names.some((name)=>name.includes("jsx")||name.includes("script"))); await client.close(); await server.close();
});
