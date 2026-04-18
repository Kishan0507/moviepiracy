"""Generate DMCA takedown report as PDF."""
import io
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.units import inch


def generate_dmca_pdf(case):
    """Generate a DMCA takedown notice PDF for a piracy case."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.8 * inch, bottomMargin=0.8 * inch)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('CustomTitle', parent=styles['Title'], fontSize=20, spaceAfter=6, textColor=colors.HexColor('#1e293b'))
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=11, textColor=colors.grey, spaceAfter=20)
    heading_style = ParagraphStyle('SectionHeading', parent=styles['Heading2'], fontSize=14, spaceAfter=8, textColor=colors.HexColor('#1e293b'))
    body_style = ParagraphStyle('Body', parent=styles['Normal'], fontSize=10, leading=14, spaceAfter=8)
    bold_style = ParagraphStyle('BoldBody', parent=body_style, fontName='Helvetica-Bold')

    elements = []

    # Header
    elements.append(Paragraph("DMCA TAKEDOWN NOTICE", title_style))
    elements.append(Paragraph("Digital Millennium Copyright Act — 17 U.S.C. § 512(c)", subtitle_style))
    elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#3b82f6')))
    elements.append(Spacer(1, 16))

    # Case Info
    elements.append(Paragraph("Case Information", heading_style))
    case_data = [
        ["Case Number", case.case_number],
        ["Date Filed", datetime.now().strftime("%B %d, %Y at %I:%M %p")],
        ["Severity", case.severity],
        ["Status", case.status],
        ["Confidence", f"{case.confidence}%"],
    ]
    table = Table(case_data, colWidths=[2.2 * inch, 4 * inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1e293b')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 20))

    # Copyrighted Work
    elements.append(Paragraph("Copyrighted Work Identified", heading_style))
    if case.movie:
        movie_data = [
            ["Movie Title", case.movie.title],
            ["Movie ID", str(case.movie.id)],
            ["Upload Date", case.movie.created_at.strftime("%B %d, %Y") if case.movie.created_at else "N/A"],
        ]
        table2 = Table(movie_data, colWidths=[2.2 * inch, 4 * inch])
        table2.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f1f5f9')),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ]))
        elements.append(table2)
    else:
        elements.append(Paragraph("Movie details unavailable", body_style))
    elements.append(Spacer(1, 20))

    # Infringing Source
    elements.append(Paragraph("Source of Infringement", heading_style))
    if case.theatre:
        theatre_data = [
            ["Theatre Name", case.theatre.name],
            ["Location", case.theatre.location],
            ["Contact Email", case.theatre.contact_email or "N/A"],
            ["Compliance Score", f"{case.theatre.compliance_score:.0f}/100"],
        ]
        table3 = Table(theatre_data, colWidths=[2.2 * inch, 4 * inch])
        table3.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#fff7ed')),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ]))
        elements.append(table3)
    else:
        elements.append(Paragraph("Theatre details unavailable", body_style))
    elements.append(Spacer(1, 20))

    # Description
    elements.append(Paragraph("Description of Infringement", heading_style))
    elements.append(Paragraph(
        case.description or
        f"An unauthorized copy of the copyrighted work \"{case.movie.title if case.movie else 'Unknown'}\" "
        f"was detected through digital watermark analysis. The embedded invisible watermark was traced to "
        f"{case.theatre.name if case.theatre else 'an unidentified theatre'}, confirming that this copy "
        f"originated from the theatre-specific distribution. "
        f"Detection confidence: {case.confidence}%.",
        body_style
    ))
    elements.append(Spacer(1, 20))

    # Legal Statement
    elements.append(Paragraph("Good Faith Statement", heading_style))
    elements.append(Paragraph(
        "I have a good faith belief that the use of the copyrighted material described above "
        "is not authorized by the copyright owner, its agent, or the law. The information in "
        "this notification is accurate, and under penalty of perjury, I am authorized to act on "
        "behalf of the owner of the exclusive right that is allegedly infringed.",
        body_style
    ))
    elements.append(Spacer(1, 20))

    # Evidence Hash
    elements.append(Paragraph("Digital Evidence", heading_style))
    elements.append(Paragraph(
        f"This report was generated by the CineMark Anti-Piracy System on "
        f"{datetime.now().strftime('%B %d, %Y at %I:%M %p')}. "
        f"The watermark detection used AES-256 encrypted QR code payloads embedded via LSB steganography.",
        body_style
    ))
    elements.append(Spacer(1, 30))

    # Footer
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e2e8f0')))
    elements.append(Spacer(1, 8))
    footer_style = ParagraphStyle('Footer', parent=body_style, fontSize=8, textColor=colors.grey)
    elements.append(Paragraph(
        f"CineMark Anti-Piracy System — Confidential Report — {case.case_number}",
        footer_style
    ))

    doc.build(elements)
    buffer.seek(0)
    return buffer
