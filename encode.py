import json

JSONCodables = dict()

def registerCodables(*clss: any):
    for cls in clss:
        JSONCodables[cls.__name__] = cls


class JSONDecoder(json.JSONDecoder):
    def __init__(self, *a, **k):
        return super().__init__(*a, object_hook=jsonObjectHook, **k)

def jsonObjectHook(o):
    typeName = o.get("__typename", "")
    if typeName:
        cls = JSONCodables.get(typeName)
        if cls:
            return cls.fromJSON(o)
    return o


class JSONEncoder(json.JSONEncoder):
    def default(self, o):
        if hasattr(o, "toJSON"):
            return o.toJSON()
        return json.JSONEncoder.default(self, o)


def encodeJSON(thing, *a, pretty=False, **k) -> str:
    if pretty:
        k["indent"] = 4
        k["sort_keys"] = True
    return json.dumps(thing, *a, cls=JSONEncoder, **k)

def decodeJSON(s, *a, **k):
    return json.loads(s, *a, cls=JSONDecoder, **k)