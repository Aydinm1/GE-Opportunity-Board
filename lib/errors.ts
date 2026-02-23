export class AppError extends Error {
  status: number;
  expose: boolean;
  code?: string;

  constructor(
    message: string,
    {
      status = 400,
      expose = true,
      code,
    }: {
      status?: number;
      expose?: boolean;
      code?: string;
    } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.expose = expose;
    this.code = code;
  }
}
