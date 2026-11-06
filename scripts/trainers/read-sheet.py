import sys,zipfile,xml.etree.ElementTree as E,json,pathlib
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'data/raw/third-party/cross-validation-2026-11-05')
z=zipfile.ZipFile(root/'simulator.xlsx')
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
strings=[]
if 'xl/sharedStrings.xml' in z.namelist():
 for si in E.fromstring(z.read('xl/sharedStrings.xml')):
  strings.append(''.join(si.itertext()))
rels={r.attrib['Id']:r.attrib['Target'] for r in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
out=[]
for sheet in E.fromstring(z.read('xl/workbook.xml')).find('s:sheets',ns):
 target=rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
 name=target.lstrip('/') if target.startswith('/') else 'xl/'+target
 cells=[]
 for c in E.fromstring(z.read(name)).findall('.//s:c',ns):
  v=c.find('s:v',ns);f=c.find('s:f',ns)
  value=v.text if v is not None else None
  if c.attrib.get('t')=='s' and value is not None:value=strings[int(value)]
  if c.attrib.get('t')=='inlineStr':value=''.join(c.find('s:is',ns).itertext())
  if value is not None or f is not None:cells.append({'cell':c.attrib['r'],'value':value,'formula':f.text if f is not None else None})
 out.append({'name':sheet.attrib['name'],'sheetId':sheet.attrib['sheetId'],'cells':cells})
(root/'sheet-inspection.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
for s in out:
 print(s['name'],len(s['cells']),'formulas',sum(c['formula'] is not None for c in s['cells']))
 print(json.dumps([c for c in s['cells'] if c['formula'] is None][:30],ensure_ascii=False))
