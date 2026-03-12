// import { mockService } from './mockService';
import { supabaseService } from './supabaseService';

// Toggle this to switch between mock and real service
// export const api = mockService; // ← use this line to revert to mock data
export const api = supabaseService;
