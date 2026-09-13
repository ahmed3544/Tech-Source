const fs = require('fs');

const path = 'server/device-sync-v2.ts';
let code = fs.readFileSync(path, 'utf8');
const marker = '/* NEON_AUTHORITATIVE_SYNC_V6 */';

if (!code.includes(marker)) {
  // A device may send its whole local snapshot, but every mutable record must
  // carry its own mutation timestamp. Never manufacture one from request time.
  code = code.replace(
    "const newestStamp = (item:any,syncTime:any) => { const itemTime=ms(item?.updatedAt); return itemTime?stamp(itemTime):stamp(syncTime); };",
    "const newestStamp = (item:any,syncTime:any) => { const itemTime=ms(item?.updatedAt); return itemTime?stamp(itemTime):''; };"
  );

  code = code.replace(
    /v\.updatedAt=newestStamp\((e|r|s|a),syncTime\);/g,
    "v.updatedAt=newestStamp($1,syncTime);if(!v.updatedAt)return;"
  );

  const oldCollection = "if(isCollection){await db.update(schema.settings).set({value:mergeCollection(a[0].value,v)} as any).where(eq(schema.settings.key,k));const next=stamp(updatedAt);const t=await db.select().from(schema.settings).where(eq(schema.settings.key,stampKey));if(!t[0])await db.insert(schema.settings).values({key:stampKey,value:next} as any);else await db.update(schema.settings).set({value:next} as any).where(eq(schema.settings.key,stampKey));return;}";
  const newCollection = "if(isCollection){if(!ts)return;const t=await db.select().from(schema.settings).where(eq(schema.settings.key,stampKey)),current=ms(t[0]?.value);if(current&&ts<current)return;await db.update(schema.settings).set({value:mergeCollection(a[0].value,v)} as any).where(eq(schema.settings.key,k));const next=stamp(updatedAt);if(!t[0])await db.insert(schema.settings).values({key:stampKey,value:next} as any);else await db.update(schema.settings).set({value:next} as any).where(eq(schema.settings.key,stampKey));return;}";
  if (!code.includes(oldCollection)) throw new Error('[patch_neon_authoritative_v6] collection block not found');
  code = code.replace(oldCollection, newCollection);

  code += `\n${marker}\n`;
  fs.writeFileSync(path, code, 'utf8');
  console.log('[patch_neon_authoritative_v6] applied');
} else {
  console.log('[patch_neon_authoritative_v6] already applied');
}
