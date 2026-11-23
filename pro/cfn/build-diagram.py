# PRO-8. Draws pro/cfn/architecture.svg (render: rsvg-convert -w 1560 -h 878 architecture.svg -o architecture.png).
# Icons: AWS Architecture Icons via the npm package aws-icons@3.3.0, unpacked to /tmp/icons.
import base64, html
I="/tmp/icons/package/icons/"
def icon(path,x,y,s=56):
    d=base64.b64encode(open(I+path,'rb').read()).decode()
    return f'<image x="{x}" y="{y}" width="{s}" height="{s}" href="data:image/svg+xml;base64,{d}"/>'
def txt(x,y,t,size=15,w="normal",anchor="middle",fill="#232F3E"):
    return f'<text x="{x}" y="{y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="{size}" font-weight="{w}" text-anchor="{anchor}" fill="{fill}">{html.escape(t)}</text>'
def lines(x,y,ts,size=13,**k):
    return "".join(txt(x,y+i*(size+4),t,size,**k) for i,t in enumerate(ts))
def group(x,y,w,h,ic,label,stroke,dash=""):
    da=f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="{stroke}" stroke-width="2"{da}/>'
            + icon("architecture-group/"+ic,x,y,32) + txt(x+40,y+21,label,14,"bold","start",stroke))
def node(ic,cx,y,label,sub=(),s=56):
    return icon(ic,cx-s/2,y,s)+txt(cx,y+s+18,label,14,"bold")+lines(cx,y+s+36,sub,12)
def arrow(x1,y1,x2,y2,label="",lx=None,ly=None,color="#545B64",dash=""):
    da=f' stroke-dasharray="{dash}"' if dash else ""
    s=f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="2"{da} marker-end="url(#a)"/>'
    if label: s+=txt(lx if lx is not None else (x1+x2)/2, ly if ly is not None else (y1+y2)/2-6,label,12,"normal","middle",color)
    return s
W,H=1560,878
o=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
 '<defs><marker id="a" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#545B64"/></marker></defs>',
 f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>',
 txt(W/2,38,"TryAWS.now Pro — AWS Marketplace AMI with CloudFormation (standard deployment)",22,"bold"),
 txt(W/2,62,"One CloudFormation stack in the buyer's own AWS account (dedicated account recommended). All resources below are created by the template unless marked as existing.",13,"normal","middle","#545B64")]
# outside actors
o.append(node("resource/Users.svg" if False else "resource/User.svg",95,150,"Customers",("Browser, HTTPS 443",)))
o.append(node("resource/User.svg",95,330,"Operators",("HTTPS 443 (admin host,","IP allowlist); SSH 22","from OperatorCidr only")))
o.append(node("resource/Internet.svg",95,530,"WHMCS (reseller)",("Third party, optional:","/bridge/whmcs over 443",)))
o.append(node("resource/Internet.svg",95,700,"EPS payment gateway",("Third party: wallet top-ups,","server-to-server verify")))
# cloud / account
o.append(group(200,85,1340,775,"AWSCloud.svg","AWS Cloud — buyer's AWS account","#232F3E"))
o.append(group(225,125,880,715,"Region.svg","AWS Region chosen at launch","#00A4A6","6,4"))
o.append(group(250,165,520,450,"VirtualprivatecloudVPC.svg","Existing VPC (VpcId parameter)","#8C4FFF"))
o.append(group(275,205,470,385,"Publicsubnet.svg","Existing public subnet (SubnetId parameter)","#7AA116"))
# security group box
o.append('<rect x="300" y="250" width="420" height="320" fill="none" stroke="#DD344C" stroke-width="2" stroke-dasharray="4,4"/>')
o.append(txt(310,270,"Security group: 443/80 from anywhere, 22 from OperatorCidr",12,"bold","start","#DD344C"))
o.append(node("resource/AmazonEC2ElasticIPAddress.svg",370,300,"Elastic IP",("PublicIp output;","point the two domains","at it"),48))
o.append(node("resource/AmazonEC2Instance.svg",570,290,"EC2 instance (Marketplace AMI)",("Ubuntu 24.04, IMDSv2 required,","encrypted gp3 root volume","Caddy (TLS) · web · admin · worker","PostgreSQL 16 (local) · backups","installer runs at first boot"),64))
o.append(arrow(398,330,535,330))
# right side inside region (regional services)
o.append(node("architecture-service/AmazonCognito.svg",880,190,"Amazon Cognito",("Customer user pool + 2 app clients","Operator user pool + 1 app client","First operator user (e-mailed)")))
o.append(node("architecture-service/AmazonSimpleStorageService.svg",880,360,"Amazon S3",("Invoices bucket: SSE-S3,","TLS only, public access blocked,","retained on stack delete")))
o.append(node("architecture-service/AWSLicenseManager.svg",880,530,"AWS License Manager",("CheckoutLicense: Marketplace","entitlement \"pro\" (36-month contract)")))
o.append(node("architecture-service/AWSCloudFormation.svg",880,700,"AWS CloudFormation",("This stack: creates and","tags every resource shown")))
o.append(node("architecture-service/AmazonEC2.svg",510,660,"Customer resources",("Amazon Lightsail instances, created","through the Tc roles in","ap-southeast-1, ap-south-1, us-east-1"),48))
o.append(icon("architecture-service/AmazonLightsail.svg",560,660,48))
# global services column
o.append(group(1130,125,385,715,"AWSAccount.svg","Global services in the same account","#E7157B","6,4"))
o.append(node("architecture-service/AWSIdentityandAccessManagement.svg",1322,175,"AWS IAM",("Instance role + instance profile (EC2 only):","AssumeRole on the Tc roles, CheckoutLicense,","2 Cognito reads (installer), PutObject invoices")))
o.append(node("resource/AWSIdentityAccessManagementRole.svg",1322,365,"Tc roles + permission boundary",("TcProvisioner, TcReader, TcAccessDetails,","TcBillingReader: trusted only by the","instance role + the stack's ExternalId")))
o.append(node("architecture-service/AmazonRoute53.svg",1322,560,"Amazon Route 53 (optional)",("TcDnsProvisioner, TcDnsReader:","created only when EnableDomains=yes","for customer DNS zones and domains")))
o.append(txt(1322,770,"No long-term access keys are created or requested.",12,"bold"))
o.append(txt(1322,788,"All AWS access uses the EC2 instance role (IMDSv2).",12,"normal"))
# helpers for routed lines
def poly(pts,color="#545B64",dash="",head=True):
    da=f' stroke-dasharray="{dash}"' if dash else ""
    mk=' marker-end="url(#a)"' if head else ""
    return f'<polyline points="{" ".join(f"{x},{y}" for x,y in pts)}" fill="none" stroke="{color}" stroke-width="2"{da}{mk}/>'
# actors -> junction at x=255 -> Elastic IP
J=(255,324)
o.append(poly([(130,180),J],head=False)); o.append(txt(150,215,"HTTPS 443",12,"normal","start","#545B64"))
o.append(poly([(130,360),J],head=False)); o.append(txt(140,372,"HTTPS 443 / SSH 22",12,"normal","start","#545B64"))
o.append(poly([(130,560),J],head=False)); o.append(txt(150,495,"HTTPS 443",12,"normal","start","#545B64"))
o.append(poly([(130,725),J],head=False)); o.append(txt(140,655,"Return + IPN",12,"normal","start","#545B64"))
o.append(poly([J,(344,324)]))
# instance -> regional services
o.append(poly([(605,300),(845,225)])); o.append(txt(762,240,"Token APIs",12,"normal","start","#545B64"))
o.append(poly([(605,322),(845,385)])); o.append(txt(700,336,"PutObject",12,"normal","start","#545B64"))
o.append(poly([(605,345),(845,555)])); o.append(txt(790,512,"CheckoutLicense",12,"normal","start","#545B64"))
# instance role credentials (routed above Cognito)
o.append(poly([(602,296),(732,296),(732,152),(1110,152),(1288,195)],"#E7157B","6,4"))
o.append(txt(830,146,"Instance role credentials (IMDSv2)",12,"normal","middle","#E7157B"))
o.append(poly([(1322,300),(1322,360)])); o.append(txt(1332,335,"sts:AssumeRole + ExternalId",12,"normal","start","#545B64"))
o.append(poly([(1322,492),(1322,555)])); o.append(txt(1332,527,"only if EnableDomains=yes",12,"normal","start","#545B64"))
# Tc roles -> customer Lightsail
o.append(poly([(1292,395),(1118,395),(1118,684),(612,684)]))
o.append(txt(870,677,"Manage customer Lightsail (through the Tc roles)",12,"normal","middle","#545B64"))
o.append('</svg>')
open('/home/claude/tryaws.now/pro/cfn/architecture.svg','w').write("".join(o))
