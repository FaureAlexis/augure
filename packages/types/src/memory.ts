export interface MemoryStore {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  list(directory?: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}
