// eslint-disable-next-line header/header
import { Type } from './graph/type-node';

export type NameTypePair = {
    name: string;
    type: Type;
}

export function compareNameTypePairs(left: NameTypePair[], right: NameTypePair[], comparator: (l: Type, r: Type) => boolean): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let i = 0; i < left.length; i++) {
        if (this.compareParameter(left[i], right[i], comparator) === false) {
            return false;
        }
    }
    return true;
}
export function compareNameTypePair(left: NameTypePair | undefined, right: NameTypePair | undefined, comparator: (l: Type, r: Type) => boolean): boolean {
    if ((left === undefined) !== (right === undefined)) {
        return false;
    }
    if (left && right) {
        return comparator(left.type, right.type);
    } else {
        return true;
    }
}

export function compareTypes(left: Type[], right: Type[], comparator: (l: Type, r: Type) => boolean): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let i = 0; i < left.length; i++) {
        if (comparator(left[i], right[i]) === false) {
            return false;
        }
    }
    return true;
}

export function compareNameTypesMap(sourceFields: Map<string, Type>, targetFields: Map<string, Type>, comparator: (l: Type, r: Type) => boolean): boolean {
    if (sourceFields.size !== targetFields.size) {
        return false;
    }
    for (const entry of sourceFields.entries()) {
        const sourceType = entry[1];
        const targetType = targetFields.get(entry[0]);
        if (targetType === undefined || comparator(sourceType, targetType) === false) {
            return false;
        }
    }
    return true;
}
