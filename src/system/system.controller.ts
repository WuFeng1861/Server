import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { SystemService } from './system.service';
import {IsNotEmpty, IsString} from 'class-validator';

class RestartDto {
  @IsNotEmpty()
  @IsString()
  password: string;
}

@Controller('api/system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Post('restart-p')
  async restart(@Body() restartDto: RestartDto) {
    console.log(process.env.SERVER_PASSWORD, restartDto)
    if (restartDto.password !== process.env.SERVER_PASSWORD) {
      throw new HttpException('Invalid password', HttpStatus.UNAUTHORIZED);
    }
    
    await this.systemService.restart();
    return { message: 'System is shutting down' };
  }
}
