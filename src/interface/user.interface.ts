export interface IUser {
  id: string;
  is_connected: boolean;
  connected_to?: string;
  interests?: string[];
}