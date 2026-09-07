import fs from "fs";
import path from "path";

export function profileDatabasePath(userData: string, id: string): string {
  if (!path.isAbsolute(userData) || !/^(default|restored-[a-zA-Z0-9-]+)$/.test(id)) {
    throw new Error("Invalid personal profile");
  }
  return path.join(userData, "profiles", id, "book.sqlite");
}

export function existingProfilePath(userData: string, id: string): string {
  const filename = profileDatabasePath(userData, id);
  // A selected profile must already exist. Never silently replace a lost book with an empty one.
  if (!fs.lstatSync(filename).isFile() || fs.realpathSync(filename) !== path.join(fs.realpathSync(userData), "profiles", id, "book.sqlite")) {
    throw new Error("Personal profile must be a regular file inside application storage");
  }
  return filename;
}

export function readActiveProfile(userData: string): string {
  let content: string;
  try { content = fs.readFileSync(path.join(userData, "active-profile.json"), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "default";
    throw error;
  }
  const selected = JSON.parse(content);
  if (typeof selected?.id !== "string") throw new Error("Invalid active profile selection");
  existingProfilePath(userData, selected.id);
  return selected.id;
}
