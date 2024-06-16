import { Injectable } from '@nestjs/common';
import { User } from './user.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { IUser } from 'src/interface/user.interface';
import { CreateUserDto } from './user.dto';

@Injectable()
export class UsersService {

    constructor(@InjectModel(User.name) private userModel: Model<User>) { }

    users: IUser[] = [];

    getActiveUser(id: string) {
        return this.users.find((user) => !user.is_connected && id !== user.id);
    }

    newUser(id: string) {
        this.users.push({
            id,
            is_connected: false,
        });
    }

    removeUser(id: string) {
        this.users = this.users.filter((user) => user.id !== id);
    }

    getUserById(socketId: string) {
        return this.users.find((user) => user.id === socketId);
    }

    setUserConnected(fromSocketId: string, toSocketId: string) {
        this.users = this.users.map((user) => {
            if (user.id === fromSocketId) {
                return {
                    ...user,
                    is_connected: true,
                    connected_to: toSocketId,
                };
            } else {
                return user;
            }
        });
    }

    setUserDisconnected(fromSocketId: string, toSocketId: string) {
        this.users = this.users.map((user) => {
            if (user.id === fromSocketId || toSocketId === user.id) {
                return {
                    ...user,
                    is_connected: false,
                    connected_to: undefined,
                };
            } else {
                return user;
            }
        });
    }

    async create(createUserDto: CreateUserDto): Promise<User> {
        const createdCat = new this.userModel(createUserDto);
        return createdCat.save();
    }

    async findAll() {
        return this.userModel.find().exec();
    }

    async findOne(username: string) {
        return this.userModel.findOne({
            $or: [
                { username },
                { email: username }
            ]
        })
    }

    async findById(_id: string) {
        return this.userModel.findById(_id);
    }
}
