import { DynamicModule, Module, ModuleMetadata, Provider } from '@nestjs/common';
import { HealthController } from './health.controller';

export interface HealthModuleOptions {
  readonly imports?: ModuleMetadata['imports'];
  readonly readinessProvider?: Provider;
}

@Module({
  controllers: [HealthController],
})
export class HealthModule {
  static register(options: HealthModuleOptions = {}): DynamicModule {
    return {
      module: HealthModule,
      imports: options.imports ?? [],
      providers: options.readinessProvider ? [options.readinessProvider] : [],
    };
  }
}
