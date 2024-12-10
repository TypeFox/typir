/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { TypeEqualityProblem } from '../../services/equality.js';
import { SubTypeProblem } from '../../services/subtype.js';
import { isType, Type } from '../../graph/type-node.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { TypirProblem } from '../../utils/utils-definitions.js';
import { checkNameTypesMap, checkValueForConflict, createKindConflict, IndexedTypeConflict, createTypeCheckStrategy } from '../../utils/utils-type-comparison.js';
import { toArray, assertUnreachable } from '../../utils/utils.js';
import { FunctionType } from '../function/function-type.js';
import { ClassKind, ClassTypeDetails, isClassKind } from './class-kind.js';

export interface FieldDetails {
    name: string;
    type: TypeReference<Type>;
}

/**
 * Describes all properties of Methods of a Class.
 * The final reason to describe methods with Function types was to have a simple solution and to reuse all the implementations for functions,
 * since methods and functions are the same from a typing perspective.
 * This interfaces makes annotating further properties to methods easier (which are not supported by functions).
 */
export interface MethodDetails {
    type: TypeReference<FunctionType>;
    // methods might have some more properties in the future
}

export class ClassType extends Type {
    override readonly kind: ClassKind;
    readonly className: string;
    /** The super classes are readonly, since they might be used to calculate the identifier of the current class, which must be stable. */
    protected superClasses: Array<TypeReference<ClassType>>; // if necessary, the array could be replaced by Map<string, ClassType>: name/form -> ClassType, for faster look-ups
    protected readonly subClasses: ClassType[] = []; // additional sub classes might be added later on!
    protected readonly fields: Map<string, FieldDetails> = new Map(); // unordered
    protected methods: MethodDetails[]; // unordered

    constructor(kind: ClassKind, typeDetails: ClassTypeDetails) {
        super(kind.options.typing === 'Nominal'
            ? kind.calculateIdentifierWithClassNameOnly(typeDetails) // use the name of the class as identifier already now
            : undefined); // the identifier for structurally typed classes will be set later after resolving all fields and methods
        this.kind = kind;
        this.className = typeDetails.className;

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const thisType = this;

        // resolve the super classes
        this.superClasses = toArray(typeDetails.superClasses).map(superr => {
            const superRef = new TypeReference<ClassType>(superr, kind.services);
            superRef.addListener({
                onTypeReferenceResolved(_reference, superType) {
                    // after the super-class is complete, register this class as sub-class for that super-class
                    superType.subClasses.push(thisType);
                },
                onTypeReferenceInvalidated(_reference, superType) {
                    if (superType) {
                        // if the superType gets invalid, de-register this class as sub-class of the super-class
                        superType.subClasses.splice(superType.subClasses.indexOf(thisType), 1);
                    } else {
                        // initially do nothing
                    }
                },
            }, true);
            return superRef;
        });

        // resolve fields
        typeDetails.fields
            .map(field => <FieldDetails>{
                name: field.name,
                type: new TypeReference(field.type, kind.services),
            })
            .forEach(field => {
                if (this.fields.has(field.name)) {
                    // check collisions of field names
                    throw new Error(`The field name '${field.name}' is not unique for class '${this.className}'.`);
                } else {
                    this.fields.set(field.name, field);
                }
            });
        const refFields: TypeReference[] = [];
        [...this.fields.values()].forEach(f => refFields.push(f.type));

        // resolve methods
        this.methods = typeDetails.methods.map(method => <MethodDetails>{
            type: new TypeReference(kind.getMethodKind().create(method), kind.services),
        });
        const refMethods = this.methods.map(m => m.type);
        // the uniqueness of methods can be checked with the predefined UniqueMethodValidation below

        // const all: Array<TypeReference<Type | FunctionType>> = [];
        const fieldsAndMethods: Array<TypeReference<Type>> = [];
        fieldsAndMethods.push(...refFields);
        fieldsAndMethods.push(...(refMethods as unknown as Array<TypeReference<Type>>)); // TODO dirty hack?!
        // all.push(...refMethods); // does not work

        this.defineTheInitializationProcessOfThisType({
            preconditionsForIdentifiable: {
                referencesToBeIdentifiable: fieldsAndMethods,
            },
            preconditionsForCompleted: {
                referencesToBeCompleted: this.superClasses as unknown as Array<TypeReference<Type>>,
            },
            referencesRelevantForInvalidation: [...fieldsAndMethods, ...(this.superClasses as unknown as Array<TypeReference<Type>>)],
            onIdentifiable: () => {
                // the identifier is calculated now
                this.identifier = this.kind.calculateIdentifier(typeDetails); // TODO it is still not nice, that the type resolving is done again, since the TypeReferences here are not reused
                // the registration of the type in the type graph is done by the TypeInitializer
            },
            onCompleted: () => {
                // when all super classes are completely available, do the following checks:
                // check number of allowed super classes
                if (this.kind.options.maximumNumberOfSuperClasses >= 0) {
                    if (this.kind.options.maximumNumberOfSuperClasses < this.getDeclaredSuperClasses().length) {
                        throw new Error(`Only ${this.kind.options.maximumNumberOfSuperClasses} super-classes are allowed.`);
                    }
                }
            },
            onInvalidated: () => {
                // nothing to do
            },
        });
    }

    override getName(): string {
        return `${this.className}`;
    }

    override getUserRepresentation(): string {
        const slots: string[] = [];
        // fields
        const fields: string[] = [];
        for (const field of this.getFields(false).entries()) {
            fields.push(`${field[0]}: ${field[1].getName()}`);
        }
        if (fields.length >= 1) {
            slots.push(fields.join(', '));
        }
        // methods
        const methods: string[] = [];
        for (const method of this.getMethods(false)) {
            methods.push(`${method.getUserRepresentation()}`);
        }
        if (methods.length >= 1) {
            slots.push(methods.join(', '));
        }
        // super classes
        const superClasses = this.getDeclaredSuperClasses();
        const extendedClasses = superClasses.length <= 0 ? '' : ` extends ${superClasses.map(c => c.getName()).join(', ')}`;
        // complete representation
        return `${this.className}${extendedClasses} { ${slots.join(', ')} }`;
    }

    override analyzeTypeEqualityProblems(otherType: Type): TypirProblem[] {
        if (isClassType(otherType)) {
            if (this.kind.options.typing === 'Structural') {
                // for structural typing:
                return checkNameTypesMap(this.getFields(true), otherType.getFields(true), // including fields of super-classes
                    (t1, t2) => this.kind.services.equality.getTypeEqualityProblem(t1, t2));
            } else if (this.kind.options.typing === 'Nominal') {
                // for nominal typing:
                return checkValueForConflict(this.getIdentifier(), otherType.getIdentifier(), 'name');
            } else {
                assertUnreachable(this.kind.options.typing);
            }
        } else {
            return [<TypeEqualityProblem>{
                $problem: TypeEqualityProblem,
                type1: this,
                type2: otherType,
                subProblems: [createKindConflict(otherType, this)],
            }];
        }
    }

    override analyzeIsSubTypeOf(superType: Type): TypirProblem[] {
        if (isClassType(superType)) {
            return this.analyzeSubTypeProblems(this, superType);
        } else {
            return [<SubTypeProblem>{
                $problem: SubTypeProblem,
                superType,
                subType: this,
                subProblems: [createKindConflict(this, superType)],
            }];
        }
    }

    override analyzeIsSuperTypeOf(subType: Type): TypirProblem[] {
        if (isClassType(subType)) {
            return this.analyzeSubTypeProblems(subType, this);
        } else {
            return [<SubTypeProblem>{
                $problem: SubTypeProblem,
                superType: this,
                subType,
                subProblems: [createKindConflict(subType, this)],
            }];
        }
    }

    protected analyzeSubTypeProblems(subType: ClassType, superType: ClassType): TypirProblem[] {
        if (this.kind.options.typing === 'Structural') {
            // for structural typing, the sub type needs to have all fields of the super type with assignable types (including fields of all super classes):
            const conflicts: IndexedTypeConflict[] = [];
            const subFields = subType.getFields(true);
            for (const [superFieldName, superFieldType] of superType.getFields(true)) {
                if (subFields.has(superFieldName)) {
                    // field is both in super and sub
                    const subFieldType = subFields.get(superFieldName)!;
                    const checkStrategy = createTypeCheckStrategy(this.kind.options.subtypeFieldChecking, this.kind.services);
                    const subTypeComparison = checkStrategy(subFieldType, superFieldType);
                    if (subTypeComparison !== undefined) {
                        conflicts.push({
                            $problem: IndexedTypeConflict,
                            expected: superType,
                            actual: subType,
                            propertyName: superFieldName,
                            subProblems: [subTypeComparison],
                        });
                    } else {
                        // everything is fine
                    }
                } else {
                    // missing sub field
                    conflicts.push({
                        $problem: IndexedTypeConflict,
                        expected: superFieldType,
                        actual: undefined,
                        propertyName: superFieldName,
                        subProblems: []
                    });
                }
            }
            // Note that it is not necessary to check, whether the sub class has additional fields than the super type!
            return conflicts;
        } else if (this.kind.options.typing === 'Nominal') {
            // for nominal typing (takes super classes into account)
            const allSub = subType.getAllSuperClasses(true);
            const globalResult: TypirProblem[] = [];
            for (const oneSub of allSub) {
                const localResult = this.kind.services.equality.getTypeEqualityProblem(superType, oneSub);
                if (localResult === undefined) {
                    return []; // class is found in the class hierarchy
                }
                globalResult.push(localResult); // return all conflicts, is that too much?
            }
            return globalResult;
        } else {
            assertUnreachable(this.kind.options.typing);
        }
    }

    getDeclaredSuperClasses(): ClassType[] {
        return this.superClasses.map(superr => {
            const superType = superr.getType();
            if (superType) {
                return superType;
            } else {
                throw new Error('Not all super class types are resolved.');
            }
        });
    }

    getDeclaredSubClasses(): ClassType[] {
        /* Design decision: properties vs edges (relevant also for other types)
        - for now, use properties, since they are often faster and are easier to implement
        - the alternative would be: return this.getOutgoingEdges('sub-classes'); // which is easier for graph traversal algorithms
        */
        return this.subClasses;
    }

    getAllSuperClasses(includingGivenClass: boolean = false): Set<ClassType> {
        const result = new Set<ClassType>();
        if (includingGivenClass) {
            result.add(this);
        }
        const toadd = [...this.getDeclaredSuperClasses()];
        while (toadd.length >= 1) {
            const current = toadd.pop()!;
            if (result.has(current)) {
                // nothing to do
            } else {
                // found a new super class
                result.add(current);
                // ... and add its super classes as well
                toadd.push(...current.getDeclaredSuperClasses());
            }
        }
        return result;
        // Sets preserve insertion order:
        // return Array.from(set);
    }

    getAllSubClasses(includingGivenClass: boolean = false): Set<ClassType> {
        const result = new Set<ClassType>();
        if (includingGivenClass) {
            result.add(this);
        }
        const toadd = [...this.getDeclaredSubClasses()];
        while (toadd.length >= 1) {
            const current = toadd.pop()!;
            if (result.has(current)) {
                // nothing to do
            } else {
                // found a new sub class
                result.add(current);
                // ... and add its sub classes as well
                toadd.push(...current.getDeclaredSubClasses());
            }
        }
        return result;
    }

    hasSubSuperClassCycles(): boolean {
        return this.getAllSuperClasses(false).has(this);
    }
    ensureNoCycles(): void {
        if (this.hasSubSuperClassCycles()) {
            throw new Error('This is not possible, since this class has cycles in its super-classes!');
        }
    }

    getFields(withSuperClassesFields: boolean): Map<string, Type> {
        // in case of conflicting field names, the type of the sub-class takes precedence! TODO check this
        const result = new Map();
        // fields of super classes
        if (withSuperClassesFields) {
            this.ensureNoCycles();
            for (const superClass of this.getDeclaredSuperClasses()) {
                for (const [superName, superType] of superClass.getFields(true)) {
                    result.set(superName, superType);
                }
            }
        }
        // own fields
        this.fields.forEach(fieldDetails => {
            const field = fieldDetails.type.getType();
            if (field) {
                result.set(fieldDetails.name, field);
            } else {
                throw new Error('Not all fields are resolved.');
            }
        });
        return result;
    }

    getMethods(withSuperClassMethods: boolean): FunctionType[] {
        // own methods
        const result = this.methods.map(m => {
            const method = m.type.getType();
            if (method) {
                return method;
            } else {
                throw new Error('Not all methods are resolved.');
            }
        });
        // methods of super classes
        if (withSuperClassMethods) {
            this.ensureNoCycles();
            for (const superClass of this.getDeclaredSuperClasses()) {
                for (const superMethod of superClass.getMethods(true)) {
                    result.push(superMethod);
                }
            }
        }
        return result;
    }

}

export function isClassType(type: unknown): type is ClassType {
    return isType(type) && isClassKind(type.kind);
}
