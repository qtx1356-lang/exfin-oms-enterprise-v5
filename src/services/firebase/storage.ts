import { getStorage } from 'firebase/storage';
import { getDefaultApp, getAdminApp, isAdminContext } from './config';

let employeeStorage: any = null;
let adminStorage: any = null;

const getEmployeeStorage = () => {
  if (!employeeStorage) employeeStorage = getStorage(getDefaultApp());
  return employeeStorage;
};

const getAdminStorage = () => {
  if (!adminStorage) adminStorage = getStorage(getAdminApp());
  return adminStorage;
};

export const storage = new Proxy({}, {
  get(target, prop) {
    const activeTarget = isAdminContext() ? getAdminStorage() : getEmployeeStorage();
    if (prop === 'concrete' || prop === '_concrete') {
      return activeTarget;
    }
    const value = Reflect.get(activeTarget, prop);
    if (typeof value === 'function') {
      return value.bind(activeTarget);
    }
    return value;
  },
  set(target, prop, value) {
    const activeTarget = isAdminContext() ? getAdminStorage() : getEmployeeStorage();
    return Reflect.set(activeTarget, prop, value);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(isAdminContext() ? getAdminStorage() : getEmployeeStorage());
  },
  has(target, prop) {
    return Reflect.has(isAdminContext() ? getAdminStorage() : getEmployeeStorage(), prop);
  }
}) as any;
