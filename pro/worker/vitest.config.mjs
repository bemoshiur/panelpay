import { defineProject } from "vitest/config";
import { dbBudgets } from "../../vitest.db-budgets.mjs";

export default defineProject({ test: dbBudgets });
