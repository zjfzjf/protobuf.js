"use strict";
module.exports = encode;

var Enum     = require("./enum"),
    Writer   = require("./writer"),
    types    = require("./types"),
    util     = require("./util");
var safeProp = util.safeProp;

function encodeType(field, value, writer) {
    if (field.resolvedType.group)
        field.resolvedType.encode(value, writer.uint32((field.id << 3 | 3) >>> 0)).uint32((field.id << 3 | 4) >>> 0);
    else if (field.resolvedType.encode(value, writer.fork()).len || field.required)
        writer.ldelim(field.id);
    else
        writer.reset();
}

/**
 * General purpose message encoder.
 * @param {Message|Object} message Runtime message or plain object to encode
 * @param {Writer} [writer] Writer to encode to
 * @returns {Writer} writer
 * @this Type
 * @property {GenerateEncoder} generate Generates a type specific encoder
 */
function encode(message, writer) {
    /* eslint-disable block-scoped-var, no-redeclare */
    if (!writer)
        writer = Writer.create();
    var fields = this.getFieldsArray(), fi = 0;
    while (fi < fields.length) {
        var field    = fields[fi++].resolve(),
            type     = field.resolvedType instanceof Enum ? "uint32" : field.type,
            wireType = types.basic[type];

        // Map fields
        if (field.map) {
            var keyType = field.resolvedKeyType /* only valid is enum */ ? "uint32" : field.keyType;
            if (message[field.name] && message[field.name] !== util.emptyObject) {
                for (var keys = Object.keys(message[field.name]), i = 0; i < keys.length; ++i) {
                    writer.uint32((field.id << 3 | 2) >>> 0).fork()
                          .uint32(/*1*/8 | types.mapKey[keyType])[keyType](keys[i]);
                    if (wireType === undefined)
                        field.resolvedType.encode(message[field.name][keys[i]], writer.uint32(/*2,2*/18).fork()).ldelim();
                    else
                        writer.uint32(/*2*/16 | wireType)[type](message[field.name][keys[i]]);
                    writer.ldelim();
                }
            }

        // Repeated fields
        } else if (field.repeated) {
            var values = message[field.name];
            if (values && values.length) {

                // Packed repeated
                if (field.packed && types.packed[type] !== undefined) {
                    if (values.length) {
                        writer.uint32((field.id << 3 | 2) >>> 0).fork();
                        var i = 0;
                        while (i < values.length)
                            writer[type](values[i++]);
                        writer.ldelim();
                    }

                // Non-packed
                } else {
                    var i = 0;
                    if (wireType === undefined)
                        while (i < values.length)
                            encodeType(field, values[i++], writer);
                    else
                        while (i < values.length)
                            writer.uint32((field.id << 3 | wireType) >>> 0)[type](values[i++]);
                }

            }

        // Non-repeated
        } else {
            var value = message[field.name];
            if (
                field.partOf && message[field.partOf.name] === field.name
                ||
                (field.required || value !== undefined) && (field.long ? util.longNe(value, field.defaultValue.low, field.defaultValue.high) : value !== field.defaultValue)
            ) {
                if (wireType === undefined)
                    encodeType(field, value, writer);
                else
                    writer.uint32((field.id << 3 | wireType) >>> 0)[type](value);
            }
        }
    }
    return writer;
    /* eslint-enable block-scoped-var, no-redeclare */
}

function genEncodeType(gen, field, fieldIndex, ref, alwaysRequired) {
    if (field.resolvedType.group)
        return gen("types[%d].encode(%s,w.uint32(%d)).uint32(%d)", fieldIndex, ref, (field.id << 3 | 3) >>> 0, (field.id << 3 | 4) >>> 0);
    return alwaysRequired || field.required
      ? gen("types[%d].encode(%s,w.uint32(%d).fork()).ldelim()", fieldIndex, ref, (field.id << 3 | 2) >>> 0)
      : gen("types[%d].encode(%s,w.fork()).len&&w.ldelim(%d)||w.reset()", fieldIndex, ref, field.id);
}

/**
 * Generates an {@link Encoder|encoder} specific to the specified message type.
 * @typedef GenerateEncoder
 * @type {function}
 * @param {Type} mtype Message type
 * @returns {Codegen} Codegen instance
 */
/**/
encode.generate = function generate(mtype) {
    /* eslint-disable no-unexpected-multiline, block-scoped-var, no-redeclare */
    var fields = mtype.getFieldsArray();
    var oneofs = mtype.getOneofsArray();
    var gen = util.codegen("m", "w")
    ("w||(w=Writer.create())");

    var i;
    for (var i = 0; i < fields.length; ++i) {
        var field    = fields[i].resolve(),
            type     = field.resolvedType instanceof Enum ? "uint32" : field.type,
            wireType = types.basic[type],
            prop     = safeProp(field.name);

        // Map fields
        if (field.map) {
            var keyType = field.resolvedKeyType /* only valid is enum */ ? "uint32" : field.keyType;
            gen
    ("if(m%s&&m%s!==util.emptyObject){", prop, prop)
        ("for(var ks=Object.keys(m%s),i=0;i<ks.length;++i){", prop)
            ("w.uint32(%d).fork().uint32(%d).%s(ks[i])", (field.id << 3 | 2) >>> 0, 8 | types.mapKey[keyType], keyType);
            if (wireType === undefined) gen
            ("types[%d].encode(m%s[ks[i]],w.uint32(18).fork()).ldelim()", i, prop); // can't be groups
            else gen
            ("w.uint32(%d).%s(m%s[ks[i]])", 16 | wireType, type, prop);
            gen
            ("w.ldelim()")
        ("}")
    ("}");

        // Repeated fields
        } else if (field.repeated) {

            // Packed repeated
            if (field.packed && types.packed[type] !== undefined) { gen

    ("if(m%s&&m%s.length){", prop, prop)
        ("w.uint32(%d).fork()", (field.id << 3 | 2) >>> 0)
        ("for(var i=0;i<m%s.length;++i)", prop)
            ("w.%s(m%s[i])", type, prop)
        ("w.ldelim()", field.id)
    ("}");

            // Non-packed
            } else { gen

    ("if(m%s)", prop)
        ("for(var i=0;i<m%s.length;++i)", prop);
                if (wireType === undefined)
            genEncodeType(gen, field, i, "m" + prop + "[i]", true);
                else gen
            ("w.uint32(%d).%s(m%s[i])", (field.id << 3 | wireType) >>> 0, type, prop);

            }

        // Non-repeated
        } else if (!field.partOf) {
            if (!field.required) {

                if (field.long) {
                    gen
    ("if(m%s!==undefined&&util.longNe(m%s,%d,%d))", prop, prop, field.defaultValue.low, field.defaultValue.high);
                } else gen
    ("if(m%s!==undefined&&m%s!==%j)", prop, prop, field.defaultValue);

            }

            if (wireType === undefined)
        genEncodeType(gen, field, i, "m" + prop);
            else gen
        ("w.uint32(%d).%s(m%s)", (field.id << 3 | wireType) >>> 0, type, prop);

        }
    }
    for (var i = 0; i < oneofs.length; ++i) {
        var oneof = oneofs[i],
            prop  = safeProp(oneof.name);
        gen
        ("switch(m%s){", prop);
        var oneofFields = oneof.getFieldsArray();
        for (var j = 0; j < oneofFields.length; ++j) {
            var field    = oneofFields[j],
                type     = field.resolvedType instanceof Enum ? "uint32" : field.type,
                wireType = types.basic[type],
                prop     = safeProp(field.name);
            gen
            ("case%j:", field.name);

            if (wireType === undefined)
                genEncodeType(gen, field, fields.indexOf(field), "m" + prop);
            else gen
                ("w.uint32(%d).%s(m%s)", (field.id << 3 | wireType) >>> 0, type, prop);

            gen
                ("break;");

        } gen
        ("}");        
    }

    return gen
    ("return w");
    /* eslint-enable no-unexpected-multiline, block-scoped-var, no-redeclare */
};
