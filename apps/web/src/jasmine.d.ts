declare namespace jasmine {
  type SpyObj<T> = T & {
    [K in keyof T]: Spy;
  };
  interface Spy {
    (...params: any[]): any;
    and: any;
    calls: any;
    withArgs: any;
  }
  function createSpyObj(baseName: string, methodNames: any[]): any;
  function createSpyObj(methodNames: any[]): any;
  function createSpy(name?: string): Spy;
}
