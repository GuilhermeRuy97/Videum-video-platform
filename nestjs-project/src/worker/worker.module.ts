import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../channels/entities/channel.entity';
import appConfig from '../config/app.config';
import databaseConfig from '../config/database.config';
import { envValidationSchema } from '../config/env.validation';
import queueConfig from '../config/queue.config';
import storageConfig from '../config/storage.config';
import { StorageModule } from '../storage/storage.module';
import { User } from '../users/entities/user.entity';
import { Video } from '../videos/entities/video.entity';
import { UploadReconciliationProcessor } from '../videos/processors/upload-reconciliation.processor';
import { VideoProcessingProcessor } from '../videos/processors/video-processing.processor';
import {
  UPLOAD_RECONCILIATION_QUEUE,
  VIDEO_PROCESSING_QUEUE,
} from '../videos/videos.constants';

/**
 * Module tree for the separate worker process (per phase-03-upload-processing/TD-02).
 * Shares the codebase and config with the API but declares the BullMQ processor
 * instead of HTTP controllers — the API never creates a worker for the queue.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, queueConfig, storageConfig],
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [databaseConfig.KEY],
      useFactory: (dbConfig: ConfigType<typeof databaseConfig>) => ({
        type: 'postgres',
        host: dbConfig.host,
        port: dbConfig.port,
        username: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.name,
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [queueConfig.KEY],
      useFactory: (qConfig: ConfigType<typeof queueConfig>) => ({
        connection: { host: qConfig.host, port: qConfig.port },
      }),
    }),
    BullModule.registerQueue(
      { name: VIDEO_PROCESSING_QUEUE },
      { name: UPLOAD_RECONCILIATION_QUEUE },
    ),
    // The worker only queries Video, but TypeORM builds metadata for the whole
    // connected relation graph: Video `@ManyToOne(() => User)` pulls in User, whose
    // `@OneToOne(() => Channel)` inverse in turn requires Channel. All three must be
    // registered or metadata building fails ("Entity metadata for User#channel was
    // not found").
    TypeOrmModule.forFeature([Video, User, Channel]),
    StorageModule,
  ],
  providers: [VideoProcessingProcessor, UploadReconciliationProcessor],
})
export class WorkerModule {}
