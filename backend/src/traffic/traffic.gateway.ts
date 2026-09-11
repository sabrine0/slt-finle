import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { TrafficService } from './traffic.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class TrafficGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly trafficService: TrafficService) {}

  afterInit(server: Server) {
    this.trafficService.registerPublisher((snapshot) => {
      server.emit('traffic.snapshot', snapshot);
    });
  }

  async handleConnection(client: Socket) {
    client.emit('traffic.snapshot', await this.trafficService.getSnapshot());
  }
}
