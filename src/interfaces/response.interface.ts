export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

export interface ErrorResponse {
  code: number;
  message: string;
  timestamp: number;
  path: string;
  details?: any;
}
