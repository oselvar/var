namespace Varar.Core;

/// <summary>
/// The drift baseline store port (<c>varar.lock.json</c>). The filesystem implementation lives in
/// the runner; the core only depends on this interface. Port of <c>ports.ts</c>' <c>BaselineStore</c>.
/// </summary>
public interface IBaselineStore
{
    string? Read();

    void Write(string contents);
}
