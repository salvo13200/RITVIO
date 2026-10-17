import type {LyricsDocument} from './lyrics';

/** One place for the brand printed on shared images; independent of profile names. */
export const storyBrand={name:'RITVIO'} as const;
export const storySize={width:1080,height:1920} as const;
export const excerptLimits={lines:10} as const;
export type ExcerptRange={start:number;end:number};
export type ExcerptSelection={anchor:number;focus:number};
export type ExcerptProblem='empty'|'lines'|'whole';
export function excerptRows(document:Pick<LyricsDocument,'plainText'>):string[]{
  // Preserve internal blank lines and repetitions; only outer empty rows are presentation whitespace.
  return document.plainText.replace(/\r\n?/g,'\n').trim().split('\n').map(row=>row.trim());
}
export function selectedExcerpt(rows:readonly string[],range:ExcerptRange|null){
  if(!range||!Number.isInteger(range.start)||!Number.isInteger(range.end)||range.start<0||range.end<range.start||range.end>=rows.length)return {text:'',characters:0,lines:0,problem:'empty' as ExcerptProblem};
  const text=rows.slice(range.start,range.end+1).join('\n'),characters=Array.from(text).length,lines=range.end-range.start+1;
  const whole=rows.every((row,index)=>!row||index>=range.start&&index<=range.end);
  const problem:ExcerptProblem|null=!text.trim()?'empty':lines>excerptLimits.lines?'lines':whole?'whole':null;
  return {text,characters,lines,problem};
}
export function excerptRange(selection:ExcerptSelection|null):ExcerptRange|null{
  return selection?{start:Math.min(selection.anchor,selection.focus),end:Math.max(selection.anchor,selection.focus)}:null;
}
/** Keep the first click anchored until an explicit reset. Invalid extensions
 * never replace the last accepted interval, even under rapid keyboard/click input. */
export function chooseExcerpt(rows:readonly string[],previous:ExcerptSelection|null,index:number):{selection:ExcerptSelection|null;problem:ExcerptProblem|null}{
  const candidate={anchor:previous?.anchor??index,focus:index};
  const {problem}=selectedExcerpt(rows,excerptRange(candidate));
  return {selection:problem?previous:candidate,problem};
}
