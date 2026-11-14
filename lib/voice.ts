export type TranscriptEntry={id:string;party:string;segment:'customers'|'suppliers';date:string;time:string;speaker:string;text:string;source:string};
/** Reads existing transcript markers. It does not transcribe audio or infer payment promises. */
export function voiceEntries(chats:{party:string;segment:'customers'|'suppliers';text:string;source:string}[]):TranscriptEntry[] {
 const entries:TranscriptEntry[]=[];
 for(const chat of chats)for(const [index,line] of chat.text.split(/\r?\n/).entries()){
  const m=line.match(/^(\d{2})\/(\d{2})\/(\d{4}), (\d{2}:\d{2}) - ([^:]+): <Voice note transcript>\s*(.*)$/);
  if(m)entries.push({id:`${chat.source}:${index+1}`,party:chat.party,segment:chat.segment,date:`${m[3]}-${m[2]}-${m[1]}`,time:m[4],speaker:m[5],text:m[6],source:chat.source});
 }
 return entries;
}
export function transcriptFileText(filename:string,contents:string):string {
 if(!/\.(txt|vtt)$/i.test(filename))throw new Error('Choose a .txt or .vtt transcript');
 if(contents.length>200000)throw new Error('Transcript is too large (200,000 characters maximum)');
 const text=contents.trim();if(!text)throw new Error('Transcript file is empty');return text;
}
