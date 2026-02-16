import { ipcMain } from "electron";
import {
  autoCategorizationService,
  type AutoCategorizationRuleUpdateInput,
} from "../services/autoCategorizationService";
import { databaseService } from "../services/database";

export const setupAutoCategorizationIpcHandlers = () => {
  ipcMain.removeHandler("get-auto-categorization-rules");
  ipcMain.removeHandler("update-auto-categorization-rule");
  ipcMain.removeHandler("delete-auto-categorization-rule");

  ipcMain.handle("get-auto-categorization-rules", async () => {
    return autoCategorizationService.getRulesForSettings(databaseService.prismaClient);
  });

  ipcMain.handle(
    "update-auto-categorization-rule",
    async (
      _,
      data: {
        ruleId: string;
        update: AutoCategorizationRuleUpdateInput;
      }
    ) => {
      return autoCategorizationService.updateRule(
        data.ruleId,
        data.update,
        databaseService.prismaClient
      );
    }
  );

  ipcMain.handle("delete-auto-categorization-rule", async (_, ruleId: string) => {
    await autoCategorizationService.deleteRule(ruleId, databaseService.prismaClient);
    return { success: true };
  });
};
