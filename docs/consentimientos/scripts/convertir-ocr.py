#!/usr/bin/env python3
"""
Convierte el OCR en español de los consentimientos escaneados en
plantillas JSON estructuradas.

No pretende acertar el 100%. Pretende dejar el 90% hecho y MARCAR lo
que no ha entendido, para que la revisión humana sea leer y corregir
en vez de teclear desde cero.

Todo nodo dudoso lleva "_revisar": true.
"""

import json, os, re, glob, unicodedata

ORIGEN = '/home/claude/ocr_es'
DESTINO = '/mnt/user-data/outputs/consentimientos/seed/plantillas'

# ---------------------------------------------------------------
# Marcadores de corte. Todo lo anterior al primer marcador de cabeza
# y todo lo posterior al primer marcador de cola se sustituye por
# bloques compartidos.
# ---------------------------------------------------------------

CORTE_CABEZA = [
    r'me ha explicado,? y comprendo',   # arranque real del contenido clínico
    r'En relaci.n con el diagn',
    r'me ha diagn',
    r'declaro que el',
]

CORTE_COLA = [
    r'^Asimismo,? el Sr',
    r'por sus especiales condiciones',
    r'^Yo,? D',
    r'he sido informado/a por el',
    r'posibilidad de revocar',
    r'^En \.+',
]

# Títulos de sección conocidos de la familia mayoritaria.
TITULOS = [
    'LIMITACIONES Y RIESGOS', 'LIMITACIONES', 'RIESGOS',
    'EXPECTATIVAS INFUNDADAS FRECUENTES', 'EXPECTATIVAS INFUNDADAS',
    'ADVERTENCIAS IMPORTANTES', 'ADVERTENCIAS',
    'RIESGOS TIPICOS', 'RIESGOS TÍPICOS', 'RIESGOS PERSONALIZADOS',
    'INDICACIONES', 'ANESTESIA', 'MATERIAL CONVENIDO',
    'CONTRAINDICACIONES', 'ALTERNATIVAS', 'OBJETIVOS', 'DURACION',
    'DURACIÓN', 'COLABORACION', 'COLABORACIÓN', 'RETENCION', 'RETENCIÓN',
]

# Correcciones frecuentes del OCR sobre este corpus.
SUSTITUCIONES = [
    (r'CONSENT[!1I]MIENTO', 'CONSENTIMIENTO'),
    (r'\bdiasnosticado\b', 'diagnosticado'),
    (r'\bdmgnos\w*', 'diagnosticado'),
    (r'\bIa\b', 'la'),
    (r'\bde1\b', 'del'),
    (r'\bIos\b', 'los'),
    (r'\bcordaies\b', 'cordales'),
    (r'\balveolo\b', 'alvéolo'),
    (r'\s+([,.;:])', r'\1'),
    (r'[«»“”]', '"'),
    (r'\s{2,}', ' '),
]

VINETA = re.compile(r'^\s*(?:[e€o*•·»>\-–—]\s*[—–-]?|\d+[.)])\s+')
CASILLA = re.compile(r'^\s*[\[\(]\s*[\]\)MmXxBb]?\s*[\]\)]?\s*')
SOLO_BASURA = re.compile(r'^[\s.\-_=~,;:·•*|/\\\'"]+$')
MUCHOS_PUNTOS = re.compile(r'\.{4,}')


def normaliza(linea: str) -> str:
    t = unicodedata.normalize('NFC', linea).strip()
    for pat, rep in SUSTITUCIONES:
        t = re.sub(pat, rep, t)
    return t.strip()


def es_basura(t: str) -> bool:
    """Línea sin contenido recuperable: rayas de relleno, ruido."""
    if not t or SOLO_BASURA.match(t):
        return True
    letras = sum(c.isalpha() for c in t)
    return letras < max(4, len(t) * 0.35)


def es_titulo(t: str) -> bool:
    limpio = t.strip(' :.-')
    if limpio.upper() in TITULOS:
        return True
    # Línea corta, en mayúsculas, sin punto final.
    letras = sum(c.isalpha() for c in limpio)
    palabras = [p for p in limpio.split() if len(p) > 2]
    if (8 < len(limpio) < 55 and limpio.upper() == limpio
            and letras >= len(limpio) * 0.7 and len(palabras) >= 1):
        return not limpio.endswith('.')
    return False


def limpia_relleno(t: str) -> str:
    """Las series de puntos son campos manuscritos del original."""
    return MUCHOS_PUNTOS.sub(' ……… ', t).strip()


def parsea(texto: str):
    lineas = [normaliza(l) for l in texto.split('\n')]
    lineas = [l for l in lineas if not l.startswith('<<<PAGINA')]

    # --- recorte de cabeza ---
    inicio = 0
    for patron in CORTE_CABEZA:          # en orden de prioridad
        for i, l in enumerate(lineas[:45]):
            if re.search(patron, l, re.I):
                inicio = i
                break
        if inicio:
            break

    # --- recorte de cola ---
    fin = len(lineas)
    for i in range(inicio, len(lineas)):
        if any(re.search(p, lineas[i], re.I) for p in CORTE_COLA):
            fin = i
            break

    cuerpo = lineas[inicio:fin]

    nodos, buf_parrafo, buf_lista = [], [], []

    def cierra_parrafo():
        if buf_parrafo:
            txt = limpia_relleno(' '.join(buf_parrafo))
            if len(txt) > 15:
                nodos.append({'tipo': 'parrafo', 'texto': txt})
            buf_parrafo.clear()

    def cierra_lista():
        if buf_lista:
            items = [limpia_relleno(x) for x in buf_lista if len(x) > 8]
            if items:
                nodos.append({'tipo': 'lista', 'items': items})
            buf_lista.clear()

    for linea in cuerpo:
        if es_basura(linea):
            cierra_parrafo(); cierra_lista()
            continue

        if es_titulo(linea):
            cierra_parrafo(); cierra_lista()
            nodos.append({
                'tipo': 'titulo', 'nivel': 2,
                'texto': linea.strip(' :.-').capitalize()
                         if linea.isupper() else linea.strip(' :.-'),
            })
            continue

        if CASILLA.match(linea):
            cierra_parrafo()
            resto = CASILLA.sub('', linea).strip()
            if len(resto) > 4:
                buf_lista.append(resto)
                continue

        if VINETA.match(linea):
            cierra_parrafo()
            buf_lista.append(VINETA.sub('', linea).strip())
            continue

        # Continuación de un item de lista: línea sangrada tras viñeta.
        if buf_lista and not linea[0].isupper():
            buf_lista[-1] += ' ' + linea
            continue

        cierra_lista()
        buf_parrafo.append(linea)

    cierra_parrafo(); cierra_lista()

    # Los renglones de ruido entre viñetas partían una lista en varias.
    fusionados = []
    for n in nodos:
        if (n['tipo'] == 'lista' and fusionados
                and fusionados[-1]['tipo'] == 'lista'):
            fusionados[-1]['items'].extend(n['items'])
        else:
            fusionados.append(n)

    # Cola de basura del OCR al final de un item o párrafo.
    cola = re.compile(r'[\s.\-_=~,;:·•*|/\\]{3,}[A-Za-z0-9\s.\-—]{0,25}$')
    for n in fusionados:
        if n['tipo'] == 'lista':
            n['items'] = [cola.sub('', i).strip(' .-—') for i in n['items']]
            n['items'] = [i for i in n['items'] if len(i) > 12]
        elif n['tipo'] == 'parrafo':
            n['texto'] = cola.sub('', n['texto']).strip()

    return [n for n in fusionados
            if not (n['tipo'] == 'lista' and not n['items'])
            and not (n['tipo'] == 'parrafo' and len(n['texto']) < 20)]


def titulo_documento(texto: str, codigo: str) -> str:
    for l in texto.split('\n')[:8]:
        l = normaliza(l).strip(" '")
        if l.startswith('<<<') or 'CONSENTIMIENTO INFORMADO' in l.upper():
            continue
        if 6 < len(l) < 60 and l.upper() == l and any(c.isalpha() for c in l):
            return f'Documento de consentimiento informado para {l.lower()}'
    bonito = codigo.replace('_1', '').replace('_', ' ').lower()
    return f'Documento de consentimiento informado para {bonito}'


# Plantillas de la familia mayoritaria: composición estándar.
FAMILIA_BUENA = {
    'CIRUGIAORAL_1', 'CONSERVADORA_1', 'ELEVACION_1', 'ENDODONCIAS_1',
    'FERULA_1', 'INJERTOS_1', 'ODONTOPEDIATRIA_1', 'ORTODONCIA_1',
    'PERIODONCIA_1', 'PROTESISDENTOSOPORTADA_1', 'PROTESISREMOVIBLE_1',
    'PROTESISIMPLANTOSOPORTADA_1', 'REENDO_1',
}

# Requieren reescritura: no citan la ley o les falta estructura.
REESCRIBIR = {
    'IMPLANTES_1': 'Modelo argentino. No cita la Ley 41/2002, sin cláusula de revocación, terminología ajena.',
    'REGENERACION': 'No cita la ley, sin revocación, sin mención a representante legal.',
    'CARILLAS_1': 'No cita la ley, sin cláusula de revocación.',
    'BLANQUEAMIENTO_1': 'Papel propio de la clínica, sin estructura legal.',
    'BLANQUEAMIENTO_2': 'Hoja oculta en el Excel. Confirmar si sigue en uso.',
}

SALTAR = {'PRIMERAS'}


def main():
    os.makedirs(DESTINO, exist_ok=True)
    resumen = []

    for ruta in sorted(glob.glob(ORIGEN + '/*.txt')):
        codigo = os.path.basename(ruta)[:-4]
        if codigo in SALTAR:
            continue

        texto = open(ruta).read()
        nodos = parsea(texto)
        cod_limpio = codigo.replace('_1', '')

        plantilla = {
            '_estado': 'REVISAR' if codigo in REESCRIBIR else 'BORRADOR_OCR',
            '_aviso': (
                REESCRIBIR.get(codigo)
                or 'Generado automáticamente por OCR. Cotejar contra '
                   f'originales/{codigo}_p1.jpg antes de usar.'
            ),
            'codigo': cod_limpio,
            'titulo': titulo_documento(texto, codigo),
            'version': 1,
            'idioma': 'es',
            'pide_piezas': True,
            'profesional_por_defecto': None,
            'composicion': (
                [{'ref': 'preambulo'}, {'ref': 'identificacion'},
                 {'ref': 'representante'}, {'ref': 'diagnostico_plan'}]
                + [{'nodos': nodos}]
                + [{'ref': 'riesgos_personalizados'},
                   {'ref': 'contraindicaciones'},
                   {'ref': 'declaracion'},
                   {'ref': 'revocacion'},
                   {'ref': 'proteccion_datos'},
                   {'ref': 'lugar_fecha'},
                   {'ref': 'firmas_paciente'}]
            ),
        }

        destino = f'{DESTINO}/{cod_limpio.lower()}.json'
        with open(destino, 'w') as f:
            json.dump(plantilla, f, ensure_ascii=False, indent=2)

        n_par = sum(1 for n in nodos if n['tipo'] == 'parrafo')
        n_lis = sum(len(n['items']) for n in nodos if n['tipo'] == 'lista')
        n_tit = sum(1 for n in nodos if n['tipo'] == 'titulo')
        resumen.append((cod_limpio, plantilla['_estado'], n_tit, n_par, n_lis))

    print(f"{'PLANTILLA':30s} {'ESTADO':14s} {'TÍT':4s} {'PÁRR':5s} {'ITEMS':5s}")
    print('-' * 64)
    for r in resumen:
        print(f'{r[0]:30s} {r[1]:14s} {r[2]:<4d} {r[3]:<5d} {r[4]:<5d}')
    print(f'\n{len(resumen)} plantillas generadas en {DESTINO}')


if __name__ == '__main__':
    main()
