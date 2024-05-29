import { Injectable } from '@nestjs/common';
import { User } from 'src/interface/user.interface';

@Injectable()
export class UserService {
  users: User[] = [];

  getActiveUser(id: string) {
    return this.users.find(user => !user.is_connected && id !== user.id)
  }

  newUser(id: string) {
    this.users.push({
      id,
      is_connected: false,
    })
  }

  removeUser(id: string) {
    this.users = this.users.filter(user => user.id !== id);
  }

  getUserById(socketId: string) {
    return this.users.find(user => user.id === socketId);
  }

  setUserConnected(fromSocketId: string, toSocketId: string) {
    this.users = this.users.map(user => {
      if (user.id === fromSocketId) {
        return { 
          ...user, 
          is_connected: true,
          connected_to: toSocketId
         };
      } else {
        return user;
      }
    })
  }

  setUserDisconnected(fromSocketId: string, toSocketId: string) {
    this.users = this.users.map(user => {
      if (user.id === fromSocketId) {
        return { 
          ...user, 
          is_connected: false,
          connected_to: undefined
         };
      } else {
        return user;
      }
    })
  }




}
