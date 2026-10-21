/** CA4: bilingual authoring, vector masks, drawing-sheet round trip and approved mobile import. No paid calls. */
import { harness } from "./mts-harness.mjs";
import { byLang } from "./ui-lang.mjs";
if (!process.argv[3]) process.argv[3] = "/tmp/claude-0/visual-fixture.json";
const h = harness("/tmp/claude-0/ca4-mouth-mask");
const layer=h.rows.composition_layers.find(l=>!l.removed&&l.asset_id&&h.rows.asset_versions.some(v=>h.rows.asset_variants.some(a=>a.id===v.variant_id&&a.asset_id===l.asset_id)&&v.mime_type.startsWith("image/")));
const comp=h.rows.compositions.find(c=>c.id===layer?.composition_id),occ=h.rows.scene_occurrences.find(o=>o.variant_id===comp?.variant_id&&o.active);
const source=h.rows.asset_versions.find(v=>v.id===layer?.version_id)??h.rows.asset_versions.find(v=>h.rows.asset_variants.some(a=>a.id===v.variant_id&&a.asset_id===layer?.asset_id));
if(!layer||!comp||!occ||!source)throw new Error("Missing fixture");
const ID=n=>`01900000-0000-7000-8000-0055${String(n).padStart(8,"0")}`;
h.rows.animation_rigs=[{id:ID(1),project_id:h.fx.project.id,revision:1,variant_id:source.variant_id,current_version_id:ID(2),removed:false}];
h.rows.animation_rig_versions=[{id:ID(2),project_id:h.fx.project.id,revision:1,rig_id:ID(1),source_version_id:source.id,number:1,spec:{format:1,anchors:{mouth:{x:.5,y:.6}}},algorithm_version:1,removed:false}];
h.rows.animation_uses=[{id:ID(3),project_id:h.fx.project.id,revision:1,layer_id:layer.id,occurrence_id:occ.id,rig_version_id:ID(2),enabled:true,removed:false}];
async function open(page){await page.getByTestId("scene-tab-animation").click();await page.locator(`[data-anim-track="${layer.id}"]`).getByTestId("anim-segment").first().click();await page.getByTestId("ca4-open-mouth").click();await page.getByTestId("ca4-mouth-dialog").waitFor();}
async function stroke(page){const box=await page.getByTestId("ca4-brush-canvas").boundingBox();await page.mouse.move(box.x+box.width*.4,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.5,{steps:8});await page.mouse.up();}
await h.scenario("ca4-author",occ.id,"nb",async page=>{
 await open(page);h.check(await page.getByTestId("ca4-viseme-X").isVisible(),"Rhubarb A–H og X");
 await stroke(page);await page.getByTestId("ca4-brush-subtract").click();await page.getByTestId("ca4-feather").fill("0.5");await stroke(page);await page.getByTestId("ca4-brush-add").click();await stroke(page);
 await page.getByTestId("ca4-adjust-brightness").fill("1.5");await page.getByTestId("ca4-adjust-contrast").fill("0.8");await page.getByTestId("ca4-adjust-saturation").fill("1.2");await page.getByTestId("ca4-adjust-hue").fill("20");await page.getByTestId("ca4-adjust-opacity").fill("0.7");
 h.check(h.state.commands.length===0,"alt er lokalt før Lagre");
 const downloadPromise=page.waitForEvent("download");await page.getByTestId("ca4-sheet-export").click();const download=await downloadPromise;const file=`${h.out}/sheet.png`;await download.saveAs(file);h.check(download.suggestedFilename().endsWith(".png"),"tegneark eksporteres som PNG");
 await page.getByTestId("ca4-save").click();await page.getByTestId("ca4-mouth-dialog").waitFor({state:"hidden"});
 h.check(await h.eventually(()=>h.state.commands.some(c=>c.type==="UpdateSceneDraft")),"én samlet lagring");
 const command=h.state.commands.find(c=>c.type==="UpdateSceneDraft"),saved=command?.steps.find(c=>c.type==="SaveRigVersion"),part=saved?.spec.parts?.["mouth:A"];
 h.check(part?.drawing.length===1&&part.mask.length===2,"pensel er vektordata");h.check(part?.mask[0].mode==="subtract"&&part.mask[1].mode==="add"&&part.mask[0].feather===.5,"legg til, trekk fra og myk kant");h.check(part?.adjustments.brightness===1.5&&part.adjustments.contrast===.8&&part.adjustments.saturation===1.2&&part.adjustments.hue===20&&part.adjustments.opacity===.7,"alle bildejusteringer lagres");h.check(command?.steps.some(c=>c.type==="AttachAnimationUse"&&c.occurrenceId===occ.id),"bare valgt scene tar versjonen i bruk");h.check(!command?.steps.some(c=>c.type==="UpdateLayers"||c.type==="AddAssetVersion"),"originalbildet er urørt");
 await page.locator(`[data-anim-track="${layer.id}"]`).getByTestId("anim-segment").first().click();await page.getByTestId("ca4-open-mouth").click();
 await page.getByTestId("ca4-sheet-file").setInputFiles(file);await page.waitForTimeout(500);h.check(await page.getByRole("alert").count()===0,"tegneark importeres i utkast");await page.getByRole("button",{name:byLang("nb","Avbryt","Cancel"),exact:true}).click();
 await page.screenshot({path:`${h.out}/timeline.png`});
});
await h.scenario("ca4-en",occ.id,"en",async page=>{await open(page);h.check(await page.getByRole("heading",{name:"Mouth shapes and rig parts",exact:true}).isVisible(),"engelsk editor");await page.getByTestId("ca4-brush-subtract").click();h.check(await page.getByRole("button",{name:"Subtract",exact:true}).isVisible(),"engelske penselvalg");await page.getByRole("button",{name:"Cancel",exact:true}).click();h.check(h.state.commands.length===0,"Avbryt skriver ingenting");});
await h.scenario("ca4-mobile-approval",occ.id,"nb",async page=>{
 const context={type:"rig",purpose:"mouth_shape",target:{assetId:layer.asset_id,variantId:source.variant_id,sourceVersionId:source.id,slot:"mouth:A"}};
 const expiry=new Date(Date.now()+3600000).toISOString();
 h.rows.upload_sessions=[{id:ID(20),project_id:h.fx.project.id,kind:"personal",context,label:"Mouth",media_kinds:["image"],expires_at:expiry,revoked_at:null,last_seen_at:new Date().toISOString()}];
 h.rows.mobile_imports=[{id:ID(21),project_id:h.fx.project.id,session_id:ID(20),client_file_id:ID(22),path:`${h.fx.project.id}/source/mobile/mouth.png`,kind:"image",mime_type:"image/png",byte_size:100,file_name:"mouth.png",status:"done",context,asset_id:null,asset_version_id:null,dismissed:false,created_at:new Date().toISOString(),confirmed_at:new Date().toISOString()}];
 await page.route("**/_serverFn/**",async route=>{let name="";try{name=JSON.parse(Buffer.from(decodeURIComponent(new URL(route.request().url()).pathname.split("/_serverFn/")[1]),"base64url").toString()).export;}catch{}if(!/createUploadSession/.test(name))return route.fallback();return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({result:{ok:true,token:"ca4-mock-only",sessionId:ID(20),expiresAt:expiry},context:{}})});});
 await open(page);const actualId=await page.locator(`[data-anim-track="${layer.id}"]`).getByTestId("anim-segment").first().getAttribute("data-version-id");const actual=h.rows.asset_versions.find(v=>v.id===actualId);if(actual){context.target.sourceVersionId=actual.id;context.target.variantId=actual.variant_id;}await page.getByTestId("ca4-mobile").click();await page.getByTestId("ca4-approve-mobile").waitFor();
 h.check(h.state.commands.length===0,"mobilfil tas ikke automatisk i bruk");await page.getByTestId("ca4-approve-mobile").click();await page.getByRole("button",{name:byLang("nb","Godkjent i utkast","Approved in draft"),exact:true}).waitFor();h.check(h.state.commands.length===0,"mobilgodkjenning er lokal frem til Lagre");
 await page.keyboard.press("Escape");await page.getByTestId("ca4-save").click();await page.getByTestId("ca4-mouth-dialog").waitFor({state:"hidden"});h.check(await h.eventually(()=>h.state.commands.some(c=>c.type==="UpdateSceneDraft")),"godkjenning og rigg lagres samlet");
 const command=h.state.commands.find(c=>c.type==="UpdateSceneDraft"),saved=command?.steps.find(c=>c.type==="SaveRigVersion");h.check(saved?.spec.parts?.["mouth:A"]?.mobileImportId===ID(21)&&command.steps.some(c=>c.type==="AddAssetVersion"),"godkjent mobilbilde er knyttet til riktig munnform");
});
await h.scenario("ca4-phone",occ.id,"en",async page=>{
 await page.setViewportSize({width:390,height:844});let tickets=0,confirms=0;
 const png=await page.evaluate(()=>{const c=document.createElement("canvas");c.width=32;c.height=32;return c.toDataURL("image/png").split(",")[1];});
 await page.route("**/_serverFn/**",async route=>{let name="";try{name=JSON.parse(Buffer.from(decodeURIComponent(new URL(route.request().url()).pathname.split("/_serverFn/")[1]),"base64url").toString()).export;}catch{}let result;
 if(/mobileSession/.test(name))result={ok:true,message:"",kind:"shared",label:"Mouth A",mediaKinds:["image"],expiresAt:new Date(Date.now()+3600000).toISOString(),remainingFiles:10,rigCapture:{referenceUrl:`data:image/png;base64,${png}`,slot:"mouth:A"}};
 else if(/mobileUploadTicket/.test(name)){tickets++;result={ok:true,message:"",done:true};}
 else if(/mobileConfirmUpload/.test(name)){confirms++;result={ok:true,message:""};}
 else return route.fallback();return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({result,context:{}})});});
 await page.goto(`${new URL(page.url()).origin}/m/${"m".repeat(64)}`,{waitUntil:"networkidle"});await page.getByTestId("ca4-mobile-capture").waitFor();
 await page.getByTestId("ca4-mobile-file").setInputFiles({name:"mouth.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")});
 h.check(tickets===0,"telefonen sender ingenting før bekreftelse");await page.getByTestId("ca4-mobile-zoom").fill("2");await page.getByTestId("ca4-mobile-rotation").fill("30");await page.getByTestId("ca4-mobile-x").fill("0.1");await page.getByTestId("ca4-mobile-fit").click();h.check(await page.getByTestId("ca4-mobile-zoom").inputValue()==="1","mobilens Tilpass nullstiller visningen");
 await page.getByTestId("ca4-mobile-confirm").click();h.check(await h.eventually(()=>confirms===1),"bekreftet mobilbilde sendes gjennom eksisterende kø");h.check(tickets===1,"én mobilopplasting");await page.screenshot({path:`${h.out}/phone.png`});
});
await h.finish();
