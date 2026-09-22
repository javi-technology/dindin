import '@analogjs/vitest-angular/setup-zone';
import '@analogjs/vitest-angular/setup-testbed';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { vi, expect } from 'vitest';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
);

function enrichSpy(spy: any) {
  spy.and = {
    returnValue: (val: any) => spy.mockReturnValue(val),
    returnValues: (...vals: any[]) => {
      for (const v of vals) spy.mockReturnValueOnce(v);
      return spy;
    },
    callFake: (fn: any) => spy.mockImplementation(fn),
    resolveTo: (val: any) => spy.mockResolvedValue(val),
    rejectWith: (val: any) => spy.mockRejectedValue(val),
  };
  spy.calls = {
    count: () => spy.mock.calls.length,
    reset: () => spy.mockClear(),
    any: () => spy.mock.calls.length > 0,
  };
  return spy;
}

(globalThis as any).jasmine = {
  createSpy: (name?: string) => enrichSpy(vi.fn()),
  createSpyObj: (
    baseNameOrMethods: string | any[] | any,
    methodNames?: any[] | any,
  ) => {
    let methods: any;
    if (
      Array.isArray(baseNameOrMethods) ||
      (typeof baseNameOrMethods === 'object' && baseNameOrMethods !== null)
    ) {
      methods = baseNameOrMethods;
    } else {
      methods = methodNames;
    }

    const obj: any = {};
    if (Array.isArray(methods)) {
      methods.forEach((m) => {
        obj[m] = enrichSpy(vi.fn());
      });
    } else if (typeof methods === 'object' && methods !== null) {
      Object.keys(methods).forEach((m) => {
        obj[m] = enrichSpy(vi.fn().mockReturnValue(methods[m]));
      });
    }
    return obj;
  },
  objectContaining: (obj: any) => expect.objectContaining(obj),
  any: (type: any) => expect.any(type),
  anything: () => expect.anything(),
  stringMatching: (str: string | RegExp) => expect.stringMatching(str),
  arrayContaining: (arr: any[]) => expect.arrayContaining(arr),
};
