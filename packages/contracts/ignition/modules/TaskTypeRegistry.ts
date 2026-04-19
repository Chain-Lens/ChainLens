import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { INITIAL_TASK_TYPES } from "../task-types";

const TaskTypeRegistryModule = buildModule("TaskTypeRegistryModule", (m) => {
  const registry = m.contract("TaskTypeRegistry", []);

  for (const tt of INITIAL_TASK_TYPES) {
    m.call(
      registry,
      "registerTaskType",
      [tt.id, tt.name, tt.schemaURI, tt.maxResponseTime, tt.minBudget],
      { id: `register_${tt.name}` },
    );
  }

  return { registry };
});

export default TaskTypeRegistryModule;
