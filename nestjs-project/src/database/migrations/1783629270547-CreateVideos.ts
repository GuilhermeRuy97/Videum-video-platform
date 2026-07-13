import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVideos1783629270547 implements MigrationInterface {
  name = 'CreateVideos1783629270547';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."videos_status_enum" AS ENUM('uploading', 'processing', 'ready', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "videos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "public_id" uuid NOT NULL, "owner_id" uuid NOT NULL, "title" character varying(255) NOT NULL, "original_filename" character varying(255) NOT NULL, "storage_key" character varying(512) NOT NULL, "upload_id" character varying(255), "size_bytes" bigint NOT NULL, "content_type" character varying(127) NOT NULL, "status" "public"."videos_status_enum" NOT NULL DEFAULT 'uploading', "duration_seconds" integer, "thumbnail_key" character varying(512), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_39a1f0fe7991162aace659078ec" UNIQUE ("public_id"), CONSTRAINT "UQ_6ce3c9805943abd5b2950847b64" UNIQUE ("storage_key"), CONSTRAINT "PK_e4c86c0cf95aff16e9fb8220f6b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fa92ce74fa6331a7ad7743dea5" ON "videos" ("status", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD CONSTRAINT "FK_b89ed5035c8cb525f39f7f8b6b9" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "videos" DROP CONSTRAINT "FK_b89ed5035c8cb525f39f7f8b6b9"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fa92ce74fa6331a7ad7743dea5"`,
    );
    await queryRunner.query(`DROP TABLE "videos"`);
    await queryRunner.query(`DROP TYPE "public"."videos_status_enum"`);
  }
}
