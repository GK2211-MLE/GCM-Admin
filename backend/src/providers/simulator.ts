import { addSimulatorResponse } from '../routes/simulator.js';

export async function sendSimulatorMessage(to: string, body: string): Promise<boolean> {
  addSimulatorResponse(to, body);
  return true;
}
