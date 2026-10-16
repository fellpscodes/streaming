import { eq } from "drizzle-orm";
import { appSettings, db } from "@/lib/db";

export function getSetting(key: string): string | null {
  return db.select().from(appSettings).where(eq(appSettings.key, key)).get()?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } }).run();
}
