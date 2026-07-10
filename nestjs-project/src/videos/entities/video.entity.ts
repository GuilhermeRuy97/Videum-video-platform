import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { User } from '../../users/entities/user.entity';

export const VIDEO_STATUSES = [
  'uploading',
  'processing',
  'ready',
  'failed',
] as const;

export type VideoStatus = (typeof VIDEO_STATUSES)[number];

@Entity('videos')
// Composite index supports the reconciliation sweep querying drafts stuck in
// `uploading` past a timeout (upload-completion-signal/TD-01).
@Index(['status', 'created_at'])
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Public-facing identifier (UUID v7) used in every client URL — decoupled from
  // the internal v4 PK for chronological sortability, per TD-04.
  @Column({ type: 'uuid', unique: true })
  public_id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255 })
  original_filename: string;

  @Column({ type: 'varchar', length: 512, unique: true })
  storage_key: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  upload_id: string | null;

  // Stored as bigint (10 GB exceeds int4); exposed as a JS number — safe since the
  // 10 GB cap is far below Number.MAX_SAFE_INTEGER.
  @Column({
    type: 'bigint',
    transformer: {
      to: (value: number): number => value,
      from: (value: string | null): number | null =>
        value === null ? null : parseInt(value, 10),
    },
  })
  size_bytes: number;

  @Column({ type: 'varchar', length: 127 })
  content_type: string;

  @Column({ type: 'enum', enum: VIDEO_STATUSES, default: 'uploading' })
  status: VideoStatus;

  @Column({ type: 'int', nullable: true })
  duration_seconds: number | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  thumbnail_key: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Unidirectional many-to-one: a video belongs to its uploading user. No inverse
  // side on User (owned by Phase 02) — avoids touching completed code; the FK lives
  // on videos.owner_id.
  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @BeforeInsert()
  generatePublicId(): void {
    if (!this.public_id) {
      this.public_id = uuidv7();
    }
  }
}
