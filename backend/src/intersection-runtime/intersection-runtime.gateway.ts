import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { IntersectionRuntimeService } from './intersection-runtime.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class IntersectionRuntimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private unsubscribe?: () => void;

  constructor(private readonly runtime: IntersectionRuntimeService) {}

  afterInit(server: Server) {
    this.unsubscribe = this.runtime.onStateUpdate((state) => {
      server.emit(`intersection.state.${state.intersectionId}`, state);
      server.emit('intersection.state', state);
    });
  }

  handleConnection() {
    /* clients pull GET /intersections/:id/state on mount; no on-connect push needed */
  }

  handleDisconnect(_client: Socket) {
    /* no-op */
  }

  @SubscribeMessage('intersection.state.request')
  handleRequest(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { intersectionId: string },
  ) {
    if (!payload?.intersectionId) return;
    const state = this.runtime.getState(payload.intersectionId);
    client.emit(`intersection.state.${state.intersectionId}`, state);
  }

  onModuleDestroy() {
    this.unsubscribe?.();
  }
}
