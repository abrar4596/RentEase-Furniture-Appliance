import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let isConnecting = false;

export async function connectDatabase(): Promise<typeof mongoose | null> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (isConnecting) {
    return null;
  }

  isConnecting = true;
  try {
    const options: mongoose.ConnectOptions = {
      serverSelectionTimeoutMS: env.NODE_ENV === 'test' ? 2000 : 5000,
    };
    const conn = await mongoose.connect(env.MONGODB_URI, options);
    logger.info(
      { uri: env.MONGODB_URI.replace(/\/\/[^@]+@/, '//***@') },
      'Connected to MongoDB Atlas / Local'
    );
    return conn;
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to MongoDB');
    if (env.NODE_ENV === 'production') {
      process.exit(1);
    }
    return null;
  } finally {
    isConnecting = false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
}

export function getDbStatus(): 'connected' | 'connecting' | 'disconnecting' | 'disconnected' {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    case 0:
    default:
      return 'disconnected';
  }
}
