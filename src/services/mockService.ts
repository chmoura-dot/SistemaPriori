import { AppService } from './types';
import { mockEntityHandlers } from './mock/mockEntityHandlers';
import { mockAppointmentHandlers } from './mock/mockAppointmentHandlers';
import { mockMiscHandlers } from './mock/mockMiscHandlers';

// Re-exporta para compatibilidade com imports existentes
export { STORAGE_KEYS } from './mock/mockData';

export const mockService: AppService = {
  ...mockEntityHandlers,
  ...mockAppointmentHandlers,
  ...mockMiscHandlers,
};
