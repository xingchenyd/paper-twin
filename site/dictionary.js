const loaded=new Map();
const normalize=word=>word.trim().toLowerCase().replaceAll('’',"'");
const shardKey=word=>([...word].filter(c=>c>='a'&&c<='z').join('').slice(0,2)+'__').slice(0,2);
export async function lookup(raw,signal){
 const word=normalize(raw);if(!/^[a-z][a-z'-]{0,59}$/.test(word))return null;const key=shardKey(word);
 let entries=loaded.get(key);if(!entries){const response=await fetch(new URL(`./dictionary/ecdict/${key}.json`,import.meta.url),{cache:'force-cache',signal});if(!response.ok){if(response.status===404)return null;throw Error('本地词典加载失败，请检查网络后重试。');}entries=await response.json();loaded.set(key,entries);}
 const candidates=[word];if(word.endsWith("'s"))candidates.push(word.slice(0,-2));if(word.endsWith('ies'))candidates.push(word.slice(0,-3)+'y');if(word.endsWith('ing'))candidates.push(word.slice(0,-3),word.slice(0,-3)+'e');if(word.endsWith('ed'))candidates.push(word.slice(0,-2),word.slice(0,-1));if(word.endsWith('es'))candidates.push(word.slice(0,-2));if(word.endsWith('s'))candidates.push(word.slice(0,-1));
 for(const candidate of candidates){const value=entries[candidate];if(value)return {word:candidate,phonetic:value[0],translation:value[1],pos:value[2]};}return null;
}
