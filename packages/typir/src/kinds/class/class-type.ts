/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AnalyzeEqualityOptions, AnalyzeSubTypeOptions, isType, Type } from '../../graph/type-node.js';
import { TypeReference } from '../../initialization/type-reference.js';
import { TypeEqualityProblem } from '../../services/equality.js';
import { TypirSpecifics } from '../../typir.js';
import { TypirProblem } from '../../utils/utils-definitions.js';
import { checkNameTypesMap, checkTypeArrays, checkValueForConflict, createKindConflict, createTypeCheckStrategy, IndexedTypeConflict } from '../../utils/utils-type-comparison.js';
import { assertUnreachable, removeFromArray, toArray } from '../../utils/utils.js';
import { FunctionType } from '../function/function-type.js';
import { ClassKind, ClassTypeDetails, isClassKind } from './class-kind.js';

export interface FieldDetails {
    readonly name: string;
    readonly type: TypeReference<Type>;
}

/**
 * Describes all properties of Methods of a Class.
 * The final reason to describe methods with Function types was to have a simple solution and to reuse all the implementations for functions,
 * since methods and functions are the same from a typing perspective.
 * This interfaces makes annotating further properties to methods easier (which are not supported by functions).
 */
export interface MethodDetails {
    readonly type: TypeReference<FunctionType>;
    // methods might have some more properties in the future
}

export class ClassType extends Type {
    override readonly kind: ClassKind<TypirSpecifics>;
    readonly className: string;
    /** The super classes are readonly, since they might be used to calculate the identifier of the current class, which must be stable. */
    protected superClasses: Array<TypeReference<ClassType>>; // if necessary, the array could be replaced by Map<string, ClassType>: name/form -> ClassType, for faster look-ups
    protected readonly subClasses: ClassType[] = []; // additional sub classes might be added later on!
    protected readonly fields: Map<string, FieldDetails>; // unordered
    protected readonly methods: MethodDetails[]; // unordered

    constructor(kind: ClassKind<TypirSpecifics>, typeDetails: ClassTypeDetails<TypirSpecifics>) {
        super(kind.options.typing === 'Nominal'
            ? kind.calculateIdentifierWithClassNameOnly(typeDetails) // use the name of the class as identifier already now
            : undefined, // the identifier for structurally typed classes will be set later after resolving all fields and methods
        typeDetails);
        this.kind = kind;
        this.className = typeDetails.className;

        // resolve the super classes
        this.superClasses = this.createSuperClasses(typeDetails);

        // resolve fields
        this.fields = this.createFields(typeDetails);
        const refFields: Array<TypeReference<Type>> = [];
        [...this.fields.values()].forEach(f => refFields.push(f.type));

        // resolve methods
        this.methods = this.createMethods(typeDetails);
        const refMethods = this.methods.map(m => m.type);
        // the uniqueness of methods can be checked with the predefined UniqueMethodValidation below

        const fieldsAndMethods: Array<TypeReference<Type>> = [];
        fieldsAndMethods.push(...refFields);
        fieldsAndMethods.push(...(refMethods as unknown as Array<TypeReference<Type>>));

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
                        throw new Error(this.kind.options.maximumNumberOfSuperClasses === 1
                            ? 'Only 1 super-class is allowed.'
                            : `Only ${this.kind.options.maximumNumberOfSuperClasses} super-classes are allowed.`
                        );
                    }
                }
            },
            onInvalidated: () => {
                // nothing to do
            },
        });
    }

    private createSuperClasses(typeDetails: ClassTypeDetails<TypirSpecifics>): Array<TypeReference<ClassType, TypirSpecifics>> {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const thisType = this;
        const thisKind = this.kind;
        return toArray(typeDetails.superClasses).map(superr => {
            const superRef = new TypeReference<ClassType>(superr, this.kind.services);
            superRef.addListener({
                onTypeReferenceResolved(_reference, superType) {
                    // after the super-class is complete ...
                    superType.subClasses.push(thisType); // register this class as sub-class for that super-class
                    thisKind.services.Subtype.markAsSubType(thisType, superType, // register the sub-type relationship in the type graph
                        { checkForCycles: false }); // ignore cycles in sub-super-class relationships for now, since they are reported with a dedicated validation for the user
                },
                onTypeReferenceInvalidated(_reference, superType) {
                    if (superType) {
                        // if the superType gets invalid ...
                        removeFromArray(thisType, superType.subClasses); // de-register this class as sub-class of the super-class
                        // there is no need for something like "thisKind.services.Subtype.UNmarkAsSubType", since the type is removed from the graph together with all its relationships
                    } else {
                        // initially do nothing
                    }
                },
            }, true);
            if (this.kind.options.typing === 'Structural') {
                // super classes contribute fields and methods which are relevant for equality, if the class is structurally typed
                thisKind.services.infrastructure.RelationshipUpdater.markUseAsRelevant(thisType, superRef, { updateEquality: true, updateSubType: true, updateSubTypeSwitched: true });
            }
            return superRef;
        });
    }

    protected createFields(typeDetails: ClassTypeDetails<TypirSpecifics>): Map<string, FieldDetails> {
        const result = new Map<string, FieldDetails>();
        for (const details of typeDetails.fields) {
            if (result.has(details.name)) {
                // check collisions of field names
                throw new Error(`The field name '${details.name}' is not unique for class '${this.className}'.`);
            } else {
                const field = <FieldDetails>{
                    name: details.name,
                    type: new TypeReference(details.type, this.kind.services),
                };
                result.set(details.name, field);
                if (this.kind.options.typing === 'Structural') {
                    this.kind.services.infrastructure.RelationshipUpdater.markUseAsRelevant(this, field.type, { updateEquality: true, updateSubType: true });
                }
            }
        }
        return result;
    }

    private createMethods(typeDetails: ClassTypeDetails<TypirSpecifics>): MethodDetails[] {
        return typeDetails.methods.map(details => {
            const method = <MethodDetails>{
                type: new TypeReference<FunctionType>(details.type, this.kind.services),
            };
            if (this.kind.options.typing === 'Structural') {
                this.kind.services.infrastructure.RelationshipUpdater.markUseAsRelevant(this, method.type, { updateEquality: true, updateSubType: true });
            }
            return method;
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

    override analyzeTypeEquality(otherType: Type, options?: AnalyzeEqualityOptions): boolean | TypirProblem[] {
        if (otherType === this) {
            return true;
        }
        if (isClassType(otherType)) {
            if (this.kind.options.typing === 'Structural') {
                // for structural typing:
                return [
                    ...checkNameTypesMap(this.getFields(true), otherType.getFields(true), // including fields of super-classes
                        (t1, t2) => this.kind.services.Equality.getTypeEqualityProblem(t1, t2), !!options?.failFast),
                    ...checkTypeArrays(this.getMethods(true), otherType.getMethods(true), // including methods of super-classes
                        (t1, t2) => this.kind.services.Equality.getTypeEqualityProblem(t1, t2), false, !!options?.failFast),
                ];
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

    protected override analyzeSubSuperTypeProblems(subType: ClassType, superType: ClassType, options?: AnalyzeSubTypeOptions): boolean | TypirProblem[] {
        if (this.kind.options.typing === 'Structural') {
            // for structural typing, the sub type needs to have all fields of the super type with assignable types (including fields of all super classes):
            const conflicts: IndexedTypeConflict[] = [];
            const subFields = subType.getFields(true);
            const checkStrategy = createTypeCheckStrategy(this.kind.options.subtypeFieldChecking, this.kind.services);
            for (const [superFieldName, superFieldType] of superType.getFields(true)) {
                if (subFields.has(superFieldName)) {
                    // field is both in super and sub
                    const subFieldType = subFields.get(superFieldName)!;
                    const subTypeComparison = checkStrategy(subFieldType, superFieldType);
                    if (subTypeComparison !== undefined) {
                        conflicts.push({
                            $problem: IndexedTypeConflict,
                            expected: superType,
                            actual: subType,
                            propertyName: superFieldName,
                            subProblems: [subTypeComparison],
                        });
                        if (options?.failFast) { return conflicts; }
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
                    if (options?.failFast) { return conflicts; }
                }
            }
            // Note that it is not necessary to check, whether the sub class has additional fields than the super type!
            // TODO Methods!
            return conflicts;
        } else if (this.kind.options.typing === 'Nominal') {
            // for nominal typing (takes super classes into account)
            const allSub = subType.getAllSuperClasses(true);
            const globalResult: TypirProblem[] = [];
            for (const oneSub of allSub) {
                const localResult = this.kind.services.Equality.getTypeEqualityProblem(superType, oneSub);
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
