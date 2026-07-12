import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeEmitter } from './realtime.emitter';
import { RealtimeGateway } from './realtime.gateway';
import { WsAuthenticator } from './ws-authenticator';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [RealtimeGateway, RealtimeEmitter, WsAuthenticator],
  exports: [RealtimeEmitter],
})
export class RealtimeModule {}
