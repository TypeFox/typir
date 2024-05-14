fun fact(n: number): number {
    var res: number = 1;
    for (var i: number = 2; i <= n; i = i + 1) {
        print res;
        res = res * i;
    }
    return res;
}

print fact(5);
