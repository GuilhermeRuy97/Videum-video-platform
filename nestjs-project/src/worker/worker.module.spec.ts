import { Test } from '@nestjs/testing';
import { WorkerModule } from './worker.module';

describe('WorkerModule', () => {
  it('should compile with all entity relations resolved', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  }, 30000);
});
