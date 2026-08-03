// Agent Cluster — barrel export
export {
  AgentBus,
  agentBus,
  type ClusterEvent,
  type ActivationSignal,
  type AgentRole,
  type EventType,
  type ClusterMemory,
} from './agent-bus';
export {
  ActivationController,
  activationController,
  ensureAgentsActive,
} from './activation-controller';
export { styleRecordingAgent } from './style-recording-agent';
export { dataRecordingAgent } from './data-recording-agent';
