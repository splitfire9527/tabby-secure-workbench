export interface RemoteDirEntry {
  nameWire: string
  isDirectory: boolean
  size: number
  mtime: number
  mode: number
}

const LIST_SCRIPT = [
  'import os,sys,json,base64,stat',
  'raw=base64.b64decode(sys.argv[2])',
  "raw=raw or b'/'",
  'items=[]',
  'for name in os.listdir(raw):',
  ' nb=name if isinstance(name,(bytes,bytearray)) else os.fsencode(name)',
  " p=b'/'+nb if raw==b'/' else (raw+nb if raw.endswith(b'/') else raw+b'/'+nb)",
  ' try:',
  '  st=os.lstat(p)',
  ' except OSError:',
  '  continue',
  ' mode=st.st_mode',
  ' is_dir=stat.S_ISDIR(mode)',
  ' if stat.S_ISLNK(mode):',
  '  try:',
  '   is_dir=stat.S_ISDIR(os.stat(p).st_mode)',
  '  except OSError:',
  '   pass',
  ' n=base64.b64encode(nb)',
  ' try:',
  "  n=n.decode('ascii')",
  ' except Exception:',
  '  pass',
  " items.append({'n':n,'d':1 if is_dir else 0,'s':st.st_size,'m':int(st.st_mtime),'p':mode & 511})",
  "sys.stdout.write(json.dumps(items,separators=(',',':')))",
].join('\n')

const PERL_SCRIPT = [
  'use MIME::Base64;',
  'my $raw = decode_base64($ARGV[1]);',
  'if (!defined $raw || $raw eq "") { $raw = "/"; }',
  'opendir(my $dh, $raw) or die $!;',
  'my @items;',
  'while (my $name = readdir($dh)) {',
  '  next if $name eq "." || $name eq "..";',
  '  my $p = $raw eq "/" ? "/$name" : ($raw =~ m{/$} ? "$raw$name" : "$raw/$name");',
  '  my @st = lstat($p);',
  '  next unless @st;',
  '  my $mode = $st[2];',
  '  my $dir = -d $p ? 1 : 0;',
  '  my $size = $st[7];',
  '  my $mtime = int($st[9]);',
  '  my $perm = $mode & 0777;',
  '  my $n = encode_base64($name, "");',
  '  push @items, qq({"n":"$n","d":$dir,"s":$size,"m":$mtime,"p":$perm});',
  '}',
  'closedir($dh);',
  'print "[" . join(",", @items) . "]";',
].join('\n')

export function buildRemoteListCommand(python: string, wirePath: string): string {
  const scriptB64 = Buffer.from(LIST_SCRIPT, 'utf8').toString('base64')
  const pathB64 = Buffer.from(wirePath || '/', 'latin1').toString('base64')
  return `${python} -c "import base64,sys;exec(base64.b64decode(sys.argv[1]))" ${scriptB64} ${pathB64}`
}

export function buildPerlListCommand(wirePath: string): string {
  const scriptB64 = Buffer.from(PERL_SCRIPT, 'utf8').toString('base64')
  const pathB64 = Buffer.from(wirePath || '/', 'latin1').toString('base64')
  return `perl -MMIME::Base64 -e 'eval(decode_base64($ARGV[0]))' ${scriptB64} ${pathB64}`
}

export function remoteListCommands(wirePath: string): string[] {
  return [
    buildRemoteListCommand('python3', wirePath),
    buildRemoteListCommand('python', wirePath),
    buildPerlListCommand(wirePath),
  ]
}

export function parseRemoteListOutput(stdout: string): RemoteDirEntry[] | null {
  const start = stdout.indexOf('[')
  const end = stdout.lastIndexOf(']')
  if (start < 0 || end < start) return null
  let data: unknown
  try {
    data = JSON.parse(stdout.slice(start, end + 1))
  } catch {
    return null
  }
  if (!Array.isArray(data)) return null
  const entries: RemoteDirEntry[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const row = item as { n?: unknown, d?: unknown, s?: unknown, m?: unknown, p?: unknown }
    if (typeof row.n !== 'string' || !row.n) continue
    let nameWire = ''
    try {
      nameWire = Buffer.from(row.n, 'base64').toString('latin1')
    } catch {
      continue
    }
    if (!nameWire || nameWire === '.' || nameWire === '..') continue
    entries.push({
      nameWire,
      isDirectory: row.d === 1 || row.d === true,
      size: typeof row.s === 'number' ? row.s : 0,
      mtime: typeof row.m === 'number' ? row.m : 0,
      mode: typeof row.p === 'number' ? row.p : 0,
    })
  }
  return entries
}
