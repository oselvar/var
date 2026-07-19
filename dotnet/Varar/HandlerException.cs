namespace Varar;

/// <summary>
/// Thrown by a step handler to fail the step (the "throw to fail" model). The message is what the
/// core records in the failure artifact and compares for an <c>error</c>-fenced expected failure.
/// </summary>
public sealed class HandlerException : Exception
{
    public HandlerException(string message)
        : base(message)
    {
    }
}
