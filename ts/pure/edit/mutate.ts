import { parseValue } from "../parse.js";
import { jsToV } from "../ktavvalue.js";
import { pushEscapedKeySegment } from "../writer.js";
import { inlineBody, planValue, type PlanCtx } from "./splice.js";
import { stringNeedsMultiline } from "../writer.js";
import { layoutAdjust } from "./layout.js";
import { KtavError, type KtavValue } from "../../internal/api.js";
import { buildTree, collectMultilineScalarRanges, type Node, type Slot } from "./tree.js";
import { lookupValue, takeTarget } from "./splice.js";
import { parsePath } from "./path.js";
import { splitKeyPath } from "../lexer.js";
import { scanInlineBody } from "../inline.js";
import { trimWs } from "../bytes.js";
import { editErrorToKtav, utf8, eqV, charCount, physicalLine, detectEol } from "./shared.js";
import { requiresBlock } from "./layout.js";

function blockEncodable(value: ReturnType<typeof jsToV>): boolean {
 const stack = [value];
 while (stack.length) {
  const v = stack.pop()!;
  if (v.t === "string") {
   if (v.v.includes("\r")) return false;
   let start = 0;
   for (let i = 0; i <= v.v.length; i++) {
    if (i !== v.v.length && v.v[i] !== "\n") continue;
    let lo = start, hi = i;
    while (lo < hi && (v.v[lo] === " " || v.v[lo] === "\t")) lo++;
    while (hi > lo && (v.v[hi - 1] === " " || v.v[hi - 1] === "\t")) hi--;
    if (v.v.slice(lo, hi) === "))") return false;
    start = i + 1;
   }
  } else if (v.t === "array") {
   for (const child of v.v) stack.push(child);
  } else if (v.t === "object") {
   for (const child of v.v.values()) stack.push(child);
  }
 }
 return true;
}
const DEC = new TextDecoder("utf-8", { ignoreBOM: true });
const enc = new TextEncoder();
const I64_MIN = -9223372036854775808n;
const I64_MAX = 9223372036854775807n;
function validateI64(value: ReturnType<typeof jsToV>): void {
 const stack = [value];
 while (stack.length) {
  const v = stack.pop()!;
  if (v.t === "int") {
   const n = BigInt(v.v);
   if (n < I64_MIN || n > I64_MAX) fail("integer is outside the i64 range");
  } else if (v.t === "array") {
   for (let i = 0; i < v.v.length; i++) stack.push(v.v[i]!);
  } else if (v.t === "object") {
   for (const child of v.v.values()) stack.push(child);
  }
 }
}
function fail(reason:string):never { throw editErrorToKtav({k:"Unsupported",reason}); }
function parse(b:Uint8Array){ return parseValue(b); }
function bytePos(s:string,p:number):number { return DEC.decode(enc.encode(s).subarray(0,p)).length; }
function byteSlice(s:string,a:number,b:number):string { return DEC.decode(enc.encode(s).subarray(a,b)); }
function replace(s:string,a:number,b:number,ins:string):string { return s.slice(0,bytePos(s,a))+ins+s.slice(bytePos(s,b)); }
function lineStart(s:string,p:number):number { const b=enc.encode(s); while(p>0&&b[p-1]!==10&&b[p-1]!==13)p--; return p; }
function lineEnd(s:string,p:number):number { const b=enc.encode(s); while(p<b.length&&b[p]!==10&&b[p]!==13)p++; if(b[p]===13&&b[p+1]===10)return p+2; return b[p]===10||b[p]===13?p+1:p; }
function nodeAt(root:Node,path:readonly string[]):Node { let n=root; for(const s of path){ if(n.kind==="object"){const x=n.table?.get(s);if(!x)throw editErrorToKtav({k:"NotFound"});n=x;} else if(n.kind==="array"){if(!/^[0-9]+$/.test(s))throw editErrorToKtav({k:"NotFound"});const i=Number(s),x=Number.isSafeInteger(i)?n.items?.[i]:undefined;if(!x)throw editErrorToKtav({k:"NotFound"});n=x;}else throw editErrorToKtav({k:"NotFound"});}return n; }
function indentation(src:string,pos:number):string { const start=lineStart(src,pos);let i=start;const bytes=enc.encode(src);while(i<bytes.length&&(bytes[i]===32||bytes[i]===9))i++;return byteSlice(src,start,i); }
function verify(src:string,expected:ReturnType<typeof parseValue>):string { let actual:ReturnType<typeof parseValue>; try { actual=parse(utf8(src)); } catch { fail("candidate source is invalid after splice"); } if(!eqV(actual,expected))fail("semantic mismatch after splice; no lossless edit produced"); return src; }
function rootBodyRange(bytes:Uint8Array):[number,number] {
 let pos=0;
 while(pos<bytes.length){
  let start=pos;
  if(start===0&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)start=3;
  let end=start;while(end<bytes.length&&bytes[end]!==10&&bytes[end]!==13)end++;
  const [a,b]=trimWs(bytes,start,end);
  if(a<b&&!(bytes[a]===35&&bytes[a+1]===35))return[a,b];
  pos=end;if(bytes[pos]===13&&bytes[pos+1]===10)pos+=2;else if(pos<bytes.length)pos++;
 }
 return[bytes.length,bytes.length];
}
function inlineParentRange(bytes:Uint8Array,root:Node,path:readonly string[]):[number,number] { const parent=nodeAt(root,path.slice(0,-1)),slot=parent.slot;if(slot&&(slot.k==="pair"||slot.k==="item")){const a=slot.k==="pair"?slot.b0:slot.b0,b=slot.b1;if((bytes[a]===123&&bytes[b-1]===125)||(bytes[a]===91&&bytes[b-1]===93))return[a,b];}if(path.length===1&&root.inline){const [a,b]=rootBodyRange(bytes);if((bytes[a]===123&&bytes[b-1]===125)||(bytes[a]===91&&bytes[b-1]===93))return[a,b];}return fail("internal: inline target without inline parent"); }
function inlineRemovalRange(bytes:Uint8Array,root:Node,path:readonly string[],slot:Slot):[number,number] {
 const [p0,p1]=inlineParentRange(bytes,root,path);if(p1-p0<2)return fail("internal: invalid inline parent range");
 const open=bytes[p0]!,closeByte=bytes[p1-1]!,ctx={bytes,line:1,span:{start:p0,end:p1}};
 const scan=scanInlineBody(bytes,p0,p1,open,closeByte,ctx);if(scan.closerIdx!==p1-1)return fail("internal: invalid inline parent body");
 const ranges=scan.segments.map(([a,b])=>trimWs(bytes,a,b)).filter(([a,b])=>a<b);
 const anchor=slot.k==="pair"?slot.keyStart:slot.k==="item"?slot.start:slot.anchor;if(anchor===null)return fail("internal: inline target has no anchor");
 const idx=ranges.findIndex(([x,y])=>x<=anchor&&anchor<y);if(idx<0)return fail("internal: target segment not found in inline parent");
 if(ranges.length===1)return[p0+1,p1-1];
 const [a,b]=ranges[idx]!;if(idx+1<ranges.length){const [next]=ranges[idx+1]!;return[a,next];}
 const [,prevEnd]=ranges[idx-1]!;return[prevEnd,b];
}
function insert(src:string,path:readonly string[],input:KtavValue):string {
 const bytes=utf8(src),original=parse(bytes);if(!path.length)throw editErrorToKtav({k:"NotFound"});const parentPath=path.slice(0,-1),key=path.at(-1)!;const parent=lookupValue(original,parentPath);if(!parent)throw editErrorToKtav({k:"NotFound"});if(parent.t==="array")return fail("insertion into an Array is not supported; only Object members can be created");if(parent.t!=="object")throw editErrorToKtav({k:"NotFound"});if(parent.v.has(key))throw editErrorToKtav({k:"AlreadyExists"});const meta=buildTree(bytes),root=meta.root,pn=nodeAt(root,parentPath);if(pn.kind!=="object")return fail("internal: parent node is not an object");const expected=parse(bytes),pv=lookupValue(expected,parentPath)!;if(pv.t!=="object")return fail("internal: parent mismatch");const value=jsToV(input);validateI64(value);pv.v.set(key,value);
 let eol=detectEol(bytes,bytes.length);let at=bytes.length,end:number|undefined,ins="",inlineEdit=false;
 const encodePair=(inline:boolean,indent:string):string=>{const prefix:string[]=[];const rootFirst=!parentPath.length&&!meta.rootExplicit&&(pn.table?.size??0)===0;pushEscapedKeySegment(key,rootFirst,prefix);const pc:PlanCtx={slot:"pair",roleItemBlock:false,existingRaw:false,rootFirst,indent,eol,inlineCompound:inline,blockCompound:!inline};let body:string,separator=": ";if(inline){const r=inlineBody(value,value.t==="string");if("err" in r)throw editErrorToKtav(r.err);body=new TextDecoder("utf-8",{ignoreBOM:true}).decode(r.body);}else{const r=planValue(value,pc);if("err" in r)throw editErrorToKtav(r.err);body=new TextDecoder("utf-8",{ignoreBOM:true}).decode(r.body);if(r.desiredRaw)separator=":: ";}return `${prefix.join("")}${separator}${body}`;};
 const siblingIndent=(n:Node):string=>{let last:Node|undefined;for(const child of n.table?.values()??[])last=child;if(!last?.slot)return "";const pos=last.slot.k==="pair"?last.slot.colon:last.slot.k==="item"?last.slot.start:last.slot.start;return indentation(src,pos);};
 if(parentPath.length===0&&root.inline){const [a,b]=rootBodyRange(bytes);eol=detectEol(bytes,b);inlineEdit=true;const pair=encodePair(true,"");const body=byteSlice(src,a+1,b-1),scan=scanInlineBody(bytes,a,b,bytes[a]!,bytes[b-1]!,{bytes,line:1,span:{start:a,end:b}});const segments=scan.segments;const last=trimWs(bytes,...segments.at(-1)!);const previous=segments.length>1?trimWs(bytes,...segments.at(-2)!):[0,0] as [number,number];const trailing=segments.length>1&&last[0]===last[1]&&previous[0]<previous[1];if(last[0]===last[1]&&segments.length===1){at=a+1;end=b-1;ins=pair;}else if(trailing){const comma=segments.at(-2)![1];at=comma+1;ins=` ${pair},`;}else{const trimmed=trimWs(bytes,a+1,b-1);if(trimmed[0]===trimmed[1]){at=a+1;end=b-1;ins=pair;}else{at=b-1;ins=`, ${pair}`;}}
 }else if(!parentPath.length){
   if(meta.rootExplicit){let close=bytes.length,closer=-1;while(close>0){const ls=lineStart(src,close-1),le=lineEnd(src,ls);if(byteSlice(src,ls,le).trim()==="}"){closer=ls;break;}if(ls===0)break;close=ls;}if(closer<0)return fail("internal: explicit root without closer");at=closer;eol=detectEol(bytes,closer);const indent=pn.table?.size?siblingIndent(pn):"    ";const pair=encodePair(false,indent);ins=`${indent}${pair}${eol}`;}
   else {const pair=encodePair(false,"");if(bytes.length===0)ins=pair;else if(bytes.length===3&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)ins=eol+pair;else if(/[^\r\n]$/.test(src))ins=eol+pair;else ins=pair+eol;}
 }else{const sl=pn.slot;if(!sl)return fail("parent is a noncontiguous value (dotted-key/reopen intermediate); no lossless insertion point exists");if((sl.k==="pair"||sl.k==="item")&&byteSlice(src,sl.b0,sl.b0+1)==="{"){at=sl.b1-1;inlineEdit=true;eol=detectEol(bytes,sl.b1);const pair=encodePair(true,indentation(src,sl.b0));const bodyRange=trimWs(bytes,sl.b0+1,sl.b1-1),body=byteSlice(src,...bodyRange),scan=scanInlineBody(bytes,sl.b0,sl.b1,bytes[sl.b0]!,bytes[sl.b1-1]!,{bytes,line:1,span:{start:sl.b0,end:sl.b1}});const segments=scan.segments;const last=trimWs(bytes,...segments.at(-1)!);const previous=segments.length>1?trimWs(bytes,...segments.at(-2)!):[0,0] as [number,number];const trailing=segments.length>1&&last[0]===last[1]&&previous[0]<previous[1];if(last[0]===last[1]&&segments.length===1){at=sl.b0+1;end=sl.b1-1;ins=pair;}else if(trailing){const comma=segments.at(-2)![1];at=comma+1;ins=` ${pair},`;}else if(bodyRange[0]===bodyRange[1]){at=sl.b0+1;end=sl.b1-1;ins=pair;}else{at=sl.b1-1;ins=`, ${pair}`;}}else if(sl.k==="block"){at=lineStart(src,sl.end);const childIndent=siblingIndent(pn)||indentation(src,sl.start)+"    ";eol=detectEol(bytes,sl.end);ins=`${childIndent}${encodePair(false,childIndent)}${eol}`;}else return fail("insertion parent has no lossless insertion point");}
 const to=end??at;let result=replace(src,at,to,ins);const required=inlineEdit?requiresBlock(value,0):false;if(typeof required==="object")throw editErrorToKtav(required.err);const force=(required||(value.t==="string"&&stringNeedsMultiline(value.v)))&&blockEncodable(value);if(inlineEdit){const originalWidth=charCount(bytes,...physicalLine(bytes,at));const candidateBytes=utf8(result);const candidateWidth=charCount(candidateBytes,...physicalLine(candidateBytes,at));if(force||candidateWidth>Math.max(100,originalWidth)){const adjusted=layoutAdjust(bytes,candidateBytes,root,parentPath,value,[at,to,enc.encode(ins).length]);if("err" in adjusted)throw editErrorToKtav(adjusted.err);result=DEC.decode(adjusted.result);}}return verify(result,expected);
}
function remove(src:string,path:readonly string[]):string {
 const bytes=utf8(src),original=parse(bytes);if(!path.length||!lookupValue(original,path))throw editErrorToKtav({k:"NotFound"});const root=buildTree(bytes).root,n=nodeAt(root,path),sl=n.slot;if(!sl)return fail("target is a noncontiguous value (dotted-key/reopen intermediate); no lossless removal range exists");const expected=parse(bytes);takeTarget(expected,path);const p=lookupValue(expected,path.slice(0,-1))!,last=path.at(-1)!;if(p.t==="object")p.v.delete(last);else if(p.t==="array"){const i=Number(last);if(!Number.isSafeInteger(i)||i<0||i>=p.v.length)throw editErrorToKtav({k:"NotFound"});p.v.splice(i,1);}else throw editErrorToKtav({k:"NotFound"});
 let a:number,b:number;if(n.inline)[a,b]=inlineRemovalRange(bytes,root,path,sl);else if(path.length===1&&root.inline){[a,b]=rootBodyRange(bytes);if(bytes[a]===123||bytes[a]===91)[a,b]=inlineRemovalRange(bytes,root,path,sl);else return fail("internal: inline root body not found");}else{const anchor=sl.k==="pair"?sl.colon:sl.k==="item"?sl.start:sl.start;let from=lineStart(src,anchor);if(from===0&&src.charCodeAt(0)===0xfeff)from=3;const end=lineEnd(src,sl.k==="block"?sl.end:sl.b1);let to=end;if(to===bytes.length&&!/[\r\n]$/.test(src)&&from>0){if(bytes[from-1]===10){from--;if(bytes[from-1]===13)from--;}else if(bytes[from-1]===13)from--;}
 if(n.kind==="object"||n.kind==="array"){const ranges:Array<[number,number]>=[];collectMultilineScalarRanges(n,ranges);let pos=from;while(pos<to){let e=pos;while(e<to&&bytes[e]!==10&&bytes[e]!==13)e++;const data=ranges.some(([x,y])=>pos>=x&&pos<y);if(!data&&byteSlice(src,pos,e).trimStart().startsWith("##"))return fail("target contains comment lines; removal cannot preserve them losslessly");pos=lineEnd(src,pos);}}a=from;b=to;}
 const cut=replace(src,a,b,"");let cutMatches=false;try{cutMatches=eqV(parse(utf8(cut)),expected);}catch{/* Removing a dotted leaf may temporarily leave an invalid source; materialize below. */}if(cutMatches)return cut;
 // A dotted/reopened synthetic parent must remain represented when its last leaf disappears.
 const parents=path.slice(0,-1);let depth=-1;for(let i=0;i<parents.length;i++){const v=lookupValue(expected,parents.slice(0,i+1));if(v?.t==="object"&&v.v.size===0){const nd=nodeAt(root,parents.slice(0,i+1));if(!nd.slot){depth=i;break;}}}
 if(depth>=0){let container=0;for(let i=0;i<parents.length;i++)if(nodeAt(root,parents.slice(0,i+1)).slot)container=i+1;const sourceBytes=bytes;let leadEnd=a;const originalLineStart=lineStart(src,sl.k==="pair"?sl.colon:sl.k==="item"?sl.start:sl.start);if(a<originalLineStart&&a<sourceBytes.length){if(sourceBytes[a]===13&&sourceBytes[a+1]===10)leadEnd=a+2;else if(sourceBytes[a]===10||sourceBytes[a]===13)leadEnd=a+1;}const indent=indentation(src,leadEnd);const key=parents.slice(container).map(s=>{const out:string[]=[];pushEscapedKeySegment(s,false,out);return out.join("");}).join(".");const trailingEol=b>0&&sourceBytes[b-1]===10?(b>1&&sourceBytes[b-2]===13?"\r\n":"\n"):b>0&&sourceBytes[b-1]===13?"\r":"";const replacement=byteSlice(src,a,leadEnd)+indent+key+": {}"+trailingEol;const materialized=replace(src,a,b,replacement);return verify(materialized,expected);}
 return verify(cut,expected);
}
function rename(src:string,path:readonly string[],newKey:string):string {
 const bytes=utf8(src),original=parse(bytes);if(!path.length)throw editErrorToKtav({k:"NotFound"});if(!newKey)return fail("empty key name is not representable");const parentPath=path.slice(0,-1),key=path.at(-1)!,parent=lookupValue(original,parentPath);if(!parent)throw editErrorToKtav({k:"NotFound"});if(parent.t==="array")return fail("rename of an Array element is not supported; only Object keys can be renamed");if(parent.t!=="object"||!parent.v.has(key))throw editErrorToKtav({k:"NotFound"});if(key===newKey)return src;if(parent.v.has(newKey))throw editErrorToKtav({k:"AlreadyExists"});const root=buildTree(bytes).root,n=nodeAt(root,path),sl=n.slot;if(!sl)return fail("target is a noncontiguous value (dotted-key/reopen intermediate); no lossless rename range exists");if(sl.k!=="pair"&&!(sl.k==="block"&&sl.anchor!==null))return fail("rename of an Array element is not supported; only Object keys can be renamed");const colon=sl.k==="pair"?sl.colon:sl.anchor!;let lo=sl.k==="pair"?sl.keyStart:lineStart(src,colon);if(lo===0&&src.charCodeAt(0)===0xfeff)lo=3;const keyRanges=splitKeyPath(bytes,lo,colon);const [segStart0,segEnd0]=keyRanges.at(-1)??[lo,colon];let segStart=segStart0,segEnd=segEnd0;while(segStart<segEnd&&(bytes[segStart]===32||bytes[segStart]===9))segStart++;while(segEnd>segStart&&(bytes[segEnd-1]===32||bytes[segEnd-1]===9))segEnd--;const encoded:string[]=[];pushEscapedKeySegment(newKey,!parentPath.length&&key===parent.v.keys().next().value,encoded);const out=replace(src,segStart,segEnd,encoded.join(""));const expected=parse(bytes),pv=lookupValue(expected,parentPath)!;if(pv.t!=="object")return fail("internal parent mismatch");const entries=[...pv.v];pv.v.clear();for(const [k,v]of entries)pv.v.set(k===key?newKey:k,v);return verify(out,expected);
}
function run(src:string,path:readonly string[],op:"insert"|"remove"|"rename",value?:KtavValue,key?:string):string {try{return op==="insert"?insert(src,path,value!):op==="remove"?remove(src,path):rename(src,path,key!);}catch(e){if(e instanceof KtavError)throw e;throw e;}}
function segmentsPath(path:string):string[]{const p=parsePath(path);if(!p.ok)throw editErrorToKtav(p.err);return p.segments;}
function textualPath(src:string,path:string):string[]{parse(utf8(src));return segmentsPath(path);}
export function insertValueSource(src:string,path:string,value:KtavValue):string{return run(src,textualPath(src,path),"insert",value);}
export function insertValueSegmentsSource(src:string,path:readonly string[],value:KtavValue):string{return run(src,path,"insert",value);}
export function removeValueSource(src:string,path:string):string{return run(src,textualPath(src,path),"remove");}
export function removeValueSegmentsSource(src:string,path:readonly string[]):string{return run(src,path,"remove");}
export function renameKeySource(src:string,path:string,key:string):string{return run(src,textualPath(src,path),"rename",undefined,key);}
export function renameKeySegmentsSource(src:string,path:readonly string[],key:string):string{return run(src,path,"rename",undefined,key);}
