interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export function nullableDataOrThrow<T>(result: QueryResult<T>): T | null {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
