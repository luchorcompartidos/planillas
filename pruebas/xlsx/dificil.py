# Arma /tmp/xlsx-salida/dificil.xlsx (y con LibreOffice: lo/dificil.xlsx, dificil.xls, dificil.ods) para importar.mjs.
# Uso: python3 pruebas/xlsx/dificil.py
import os, subprocess
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.styles.colors import Color
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.chart import BarChart, Reference
from openpyxl.worksheet.table import Table
OUT = os.environ.get('OUT', '/tmp/xlsx-salida'); os.makedirs(f'{OUT}/lo', exist_ok=True)
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Ventas'
ws.append(['Producto', 'Cant', 'Precio', 'Total'])
for i, (p, c, pr) in enumerate([('Yerba', 2, 1500.5), ('Azúcar', 3, 800), ('Café', 1, 4200)], start=2):
    ws.append([p, c, pr, f'=B{i}*C{i}'])
ws['D5'] = '=SUM(D2:D4)'
ws['A1'].font = Font(bold=True, color=Color(theme=4, tint=-0.25)); ws['B1'].fill = PatternFill('solid', fgColor=Color(theme=9, tint=0.6))
ws['C1'].fill = PatternFill('solid', fgColor=Color(indexed=13)); ws['D1'].fill = PatternFill('gray125', fgColor='FFFF0000')
ws['A6'] = 'Combinada'; ws.merge_cells('A6:C6'); ws['A6'].alignment = Alignment(horizontal='center', text_rotation=45)
ws['A7'] = 'nota'; ws['A7'].comment = Comment('hola', 'yo'); ws['A8'] = 'link'; ws['A8'].hyperlink = 'https://example.com'
ws.conditional_formatting.add('B2:B4', CellIsRule(operator='greaterThan', formula=['2'], fill=PatternFill('solid', fgColor='FFFF0000')))
dv = DataValidation(type='list', formula1='"a,b"'); ws.add_data_validation(dv); dv.add('E2')
ws.freeze_panes = 'A2'; ws.row_dimensions[7].hidden = True; ws.column_dimensions['E'].hidden = True
ws.column_dimensions['A'].width = 18
ws['A2'].border = Border(left=Side('thick', color=Color(theme=5)))
ch = BarChart(); ch.add_data(Reference(ws, min_col=4, min_row=1, max_row=4), titles_from_data=True); ws.add_chart(ch, 'G2')
ws2 = wb.create_sheet('Otra'); ws2['A1'] = 'Hoja 2'; ws2['B2'] = True
ws3 = wb.create_sheet('Tabla'); ws3.append(['x', 'y']); ws3.append([1, 2]); ws3.add_table(Table(displayName='T1', ref='A1:B2'))
wb.save(f'{OUT}/dificil.xlsx')
for fmt, out in (('xlsx', f'{OUT}/lo'), ('xls', OUT), ('ods', OUT)):
    subprocess.run(['soffice', '--headless', '--convert-to', fmt, '--outdir', out, f'{OUT}/dificil.xlsx'], capture_output=True)
print('listo:', OUT)
