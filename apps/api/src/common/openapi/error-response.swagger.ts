import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Swagger-представление единого error-envelope (docs/API.md §4).
 * Зеркалит интерфейсы из common/dto/error-response.dto.ts (те — без декораторов,
 * поэтому в схему OpenAPI не попадают). Только для документации.
 */
export class ErrorDetailDto {
  @ApiProperty({ example: 'email', description: 'Путь к полю (с точками для вложенных DTO)' })
  field!: string;

  @ApiProperty({ example: 'must be an email', description: 'Причина ошибки валидации' })
  issue!: string;
}

export class ErrorBodyDto {
  @ApiProperty({ example: 'VALIDATION_ERROR', description: 'Стабильный код ошибки (docs/API.md §17)' })
  code!: string;

  @ApiProperty({ example: 'Validation failed', description: 'Человекочитаемое сообщение (язык по Accept-Language)' })
  message!: string;

  @ApiPropertyOptional({ type: [ErrorDetailDto], description: 'Пер-полевые ошибки валидации' })
  details?: ErrorDetailDto[];

  @ApiProperty({ example: '0f9c1d3e-...', description: 'Корреляция с серверными логами' })
  request_id!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;
}
