import { expect, it } from "vitest";
import fs from "fs";
import path from "path";
import ts from "typescript";
import { APP_IPC_CHANNELS } from "./ipcChannels";

it("keeps every runtime registration in the reviewed channel inventory and prevents raw Electron imports in handler modules", () => {
  const registered = new Set<string>();
  for (const name of fs.readdirSync("src/main").filter((name) => name.endsWith(".ts") && !name.includes(".test."))) {
    const source = fs.readFileSync(path.join("src/main", name), "utf8");
    const tree = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) && name.startsWith("ipcHandlers.") &&
        ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "electron") {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          expect(bindings.elements.some((element) => (element.propertyName ?? element.name).text === "ipcMain")).toBe(false);
        }
      }
      if (ts.isCallExpression(node) && ((ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "handle") ||
        (ts.isIdentifier(node.expression) && node.expression.text === "register"))) {
        const channel = node.arguments[0];
        if (channel && ts.isStringLiteral(channel)) registered.add(channel.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  expect([...registered].sort()).toEqual([...APP_IPC_CHANNELS].sort());
});
